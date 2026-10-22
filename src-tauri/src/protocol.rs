// protocol.rs — Custom "vault://" URI scheme protocol handler with HTTP 206 Range streaming.
//
// Allows the frontend to play MP4/WebM videos, audio, PDFs, and images directly
// in the WebView without writing plaintext files to the host OS disk and without
// buffering entire large files into RAM.

use tauri::http::{Response, StatusCode};
use tauri::Manager;
use zeroize::Zeroizing;

use crate::commands::AppState;
use crate::crypto::{self, CHUNK_SIZE};

fn error_response(status: StatusCode, msg: &[u8]) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain")
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(msg.to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Parse an HTTP `Range: bytes=start-end` header given `total_size`.
fn parse_range_header(range_val: &str, total_size: u64) -> Option<(u64, u64)> {
    if total_size == 0 {
        return None;
    }
    let stripped = range_val.trim().strip_prefix("bytes=")?;
    let first_range = stripped.split(',').next()?.trim();
    let (start_str, end_str) = first_range.split_once('-')?;

    if start_str.is_empty() {
        // Suffix range: bytes=-500
        let suffix_len: u64 = end_str.parse().ok()?;
        if suffix_len == 0 {
            return None;
        }
        let start = total_size.saturating_sub(suffix_len);
        let end = total_size - 1;
        Some((start, end))
    } else {
        let start: u64 = start_str.parse().ok()?;
        if start >= total_size {
            return None;
        }
        let max_chunk_end = (start + (CHUNK_SIZE as u64) - 1).min(total_size - 1);
        let end = if end_str.is_empty() {
            max_chunk_end
        } else {
            let parsed_end: u64 = end_str.parse().ok()?;
            parsed_end.min(total_size - 1).min(max_chunk_end)
        };
        if start <= end {
            Some((start, end))
        } else {
            None
        }
    }
}

pub fn handle_vault_request<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() == tauri::http::Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new()));
    }

    let uri = request.uri();
    let decoded_path = uri
        .path()
        .replace("%2F", "/")
        .replace("%2f", "/")
        .replace("%5C", "/")
        .replace("%5c", "/");

    let trimmed = decoded_path.trim_matches('/');
    let stripped = trimmed.strip_prefix("file/").unwrap_or(trimmed);

    // Support both `/file/<vault_id>/<file_id>` and `/file/<file_id>`
    let (vault_id_opt, file_id) = if let Some((vid, fid)) = stripped.split_once('/') {
        (Some(vid), fid)
    } else {
        (None, stripped)
    };

    let app_handle = ctx.app_handle();
    let state = app_handle.state::<AppState>();

    let range_header = request
        .headers()
        .get("range")
        .or_else(|| request.headers().get("Range"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    enum StreamOutcome {
        NotFound(&'static [u8]),
        InvalidKeyOrNonce(&'static [u8]),
        Empty {
            mime_type: String,
        },
        RangeNotSatisfiable {
            total_size: u64,
        },
        Partial {
            mime_type: String,
            start: u64,
            end: u64,
            total_size: u64,
            data: Vec<u8>,
        },
        Full {
            mime_type: String,
            data: Vec<u8>,
        },
        DecryptError(String),
    }

    struct FileRow {
        blob_id: String,
        mime_type: String,
        size_bytes: i64,
        key_bytes: Zeroizing<Vec<u8>>,
        nonce_bytes: Vec<u8>,
        compressed: bool,
    }

    let outcome_res = state.with_vault(vault_id_opt, |handle| {
        let lookup: Option<FileRow> = handle
            .conn
            .prepare(
                "SELECT blob_id, mime_type, size_bytes, file_key, file_nonce, COALESCE(compressed, 0) FROM files WHERE id = ?1",
            )
            .and_then(|mut stmt| {
                stmt.query_row(rusqlite::params![file_id], |r| {
                    Ok(FileRow {
                        blob_id: r.get(0)?,
                        mime_type: r.get(1)?,
                        size_bytes: r.get(2)?,
                        key_bytes: Zeroizing::new(r.get::<_, Vec<u8>>(3)?),
                        nonce_bytes: r.get(4)?,
                        compressed: r.get::<_, i64>(5)? != 0,
                    })
                })
            })
            .ok();

        let FileRow {
            blob_id,
            mime_type,
            size_bytes,
            key_bytes,
            nonce_bytes,
            compressed,
        } = match lookup {
            Some(row) => row,
            None => return Ok(StreamOutcome::NotFound(b"File not found")),
        };

        let file_key: Zeroizing<[u8; 32]> = match key_bytes.as_slice().try_into() {
            Ok(k) => Zeroizing::new(k),
            Err(_) => return Ok(StreamOutcome::InvalidKeyOrNonce(b"Invalid key")),
        };

        let file_nonce: [u8; 7] = match nonce_bytes.try_into() {
            Ok(n) => n,
            Err(_) => return Ok(StreamOutcome::InvalidKeyOrNonce(b"Invalid nonce")),
        };

        let total_size = size_bytes.max(0) as u64;
        if total_size == 0 {
            return Ok(StreamOutcome::Empty { mime_type });
        }

        let is_single_file = handle.is_single_file();
        let blob_path = if !is_single_file {
            let p = handle
                .vault_path
                .join("blobs")
                .join(format!("{}.dat", blob_id));
            if !p.is_file() {
                return Ok(StreamOutcome::NotFound(b"Blob not found"));
            }
            Some(p)
        } else {
            None
        };

        if let Some(ref range_str) = range_header {
            if let Some((start, end)) = parse_range_header(range_str, total_size) {
                let res = if is_single_file {
                    crypto::decrypt_file_range_from_db(
                        &handle.conn,
                        &blob_id,
                        &file_key,
                        &file_nonce,
                        total_size,
                        compressed,
                        start,
                        end,
                    )
                } else if let Some(ref bp) = blob_path {
                    crypto::decrypt_file_range(bp, &file_key, &file_nonce, total_size, compressed, start, end)
                } else {
                    return Ok(StreamOutcome::NotFound(b"Blob not found"));
                };

                match res {
                    Ok(data) => Ok(StreamOutcome::Partial {
                        mime_type,
                        start,
                        end,
                        total_size,
                        data,
                    }),
                    Err(e) => Ok(StreamOutcome::DecryptError(e.to_string())),
                }
            } else {
                Ok(StreamOutcome::RangeNotSatisfiable { total_size })
            }
        } else {
            let end = (total_size - 1).min(32 * 1024 * 1024 - 1);
            let res = if is_single_file {
                crypto::decrypt_file_range_from_db(
                    &handle.conn,
                    &blob_id,
                    &file_key,
                    &file_nonce,
                    total_size,
                    compressed,
                    0,
                    end,
                )
            } else if let Some(ref bp) = blob_path {
                crypto::decrypt_file_range(bp, &file_key, &file_nonce, total_size, compressed, 0, end)
            } else {
                return Ok(StreamOutcome::NotFound(b"Blob not found"));
            };

            match res {
                Ok(data) => Ok(StreamOutcome::Full { mime_type, data }),
                Err(e) => Ok(StreamOutcome::DecryptError(e.to_string())),
            }
        }
    });

    match outcome_res {
        Err(_) => error_response(StatusCode::UNAUTHORIZED, b"No active vault session"),
        Ok(StreamOutcome::NotFound(msg)) => error_response(StatusCode::NOT_FOUND, msg),
        Ok(StreamOutcome::InvalidKeyOrNonce(msg)) => {
            error_response(StatusCode::INTERNAL_SERVER_ERROR, msg)
        }
        Ok(StreamOutcome::Empty { mime_type }) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime_type)
            .header("Content-Length", "0")
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-store")
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new())),
        Ok(StreamOutcome::RangeNotSatisfiable { total_size }) => Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header("Content-Range", format!("bytes */{}", total_size))
            .header("Access-Control-Allow-Origin", "*")
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new())),
        Ok(StreamOutcome::Partial {
            mime_type,
            start,
            end,
            total_size,
            data,
        }) => {
            let content_range = format!("bytes {}-{}/{}", start, end, total_size);
            Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Type", mime_type)
                .header("Accept-Ranges", "bytes")
                .header("Content-Range", content_range)
                .header("Content-Length", data.len().to_string())
                .header("Access-Control-Allow-Origin", "*")
                .header("Cache-Control", "private, max-age=3600")
                .body(data)
                .unwrap_or_else(|_| Response::new(Vec::new()))
        }
        Ok(StreamOutcome::Full { mime_type, data }) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime_type)
            .header("Accept-Ranges", "bytes")
            .header("Content-Length", data.len().to_string())
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "private, max-age=3600")
            .body(data)
            .unwrap_or_else(|_| Response::new(Vec::new())),
        Ok(StreamOutcome::DecryptError(err_msg)) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Decryption error: {}", err_msg).as_bytes(),
        ),
    }
}
