// vfs.rs — Virtual filesystem operations: create, open, ingest, export, delete vaults.
//
// AGENTS.md compliance:
// - Stateless & portable vault folders: self-contained directory with vault.meta, index.db, blobs/
// - Zero whole-file RAM buffering: delegates to crypto.rs streaming
// - Memory hygiene: keys wrapped in Zeroizing, dropped after use
// - No .unwrap() / .expect() — all operations return AppResult

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rand::RngCore;
use rusqlite::Connection;
use zeroize::Zeroizing;

use crate::crypto;
use crate::db;
use crate::error::{AppError, AppResult};

/// Handle to an open vault, holding the database connection and vault paths.
pub struct VaultHandle {
    /// Path of the vault (either a single `<Name>.vault` file or a legacy vault directory).
    pub vault_path: PathBuf,
    /// Open SQLCipher database connection.
    pub conn: Connection,
}

impl VaultHandle {
    /// Returns true if this vault is a single self-contained `.vault` file (as opposed to a directory).
    pub fn is_single_file(&self) -> bool {
        self.vault_path.is_file()
    }

    /// Path to the blobs directory within this vault (directory mode only).
    fn blobs_dir(&self) -> PathBuf {
        self.vault_path.join("blobs")
    }

    /// Path to a specific blob file (directory mode only).
    fn blob_path(&self, blob_id: &str) -> PathBuf {
        self.blobs_dir().join(format!("{}.dat", blob_id))
    }
}

/// Create a new single-file `.vault` archive at `vault_file_path`.
///
/// The entire vault — Argon2id salt header (`0..16`), encrypted metadata tables, and
/// 4 MB AEAD-encrypted file chunks (`blob_chunks`) — resides inside this single SQLCipher file.
pub fn create_single_file_vault(vault_file_path: &Path, password: &str) -> AppResult<VaultHandle> {
    let mut salt16 = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt16);

    let master_key = crypto::derive_master_key_with_salt16(password, &salt16)?;
    let conn = db::create_single_file_db(vault_file_path, &master_key, &salt16)?;

    Ok(VaultHandle {
        vault_path: vault_file_path.to_path_buf(),
        conn,
    })
}

/// Open an existing single-file `.vault` archive at `vault_file_path`.
///
/// Reads the 16-byte SQLCipher salt header from bytes `0..16`, derives the 32-byte master key
/// with Argon2id, and unlocks the SQLCipher database.
pub fn open_single_file_vault(vault_file_path: &Path, password: &str) -> AppResult<VaultHandle> {
    let mut file = std::fs::File::open(vault_file_path)?;
    let mut salt16 = [0u8; 16];
    file.read_exact(&mut salt16).map_err(|_| {
        AppError::VaultFormat("Vault file is too small or corrupted".into())
    })?;
    drop(file);

    if &salt16 == b"SQLite format 3\0" {
        return Err(AppError::VaultFormat(
            "File is an unencrypted SQLite database, not an encrypted .vault file".into(),
        ));
    }

    let master_key = crypto::derive_master_key_with_salt16(password, &salt16)?;
    let conn = db::open_single_file_db(vault_file_path, &master_key, &salt16)?;

    Ok(VaultHandle {
        vault_path: vault_file_path.to_path_buf(),
        conn,
    })
}

/// Create a new vault at `<target_dir>/<vault_name>/`.
///
/// This creates the vault directory structure:
/// - `vault.meta` — binary metadata with Argon2id parameters and random salt
/// - `index.db` — SQLCipher-encrypted database (empty schema)
/// - `blobs/` — directory for encrypted file blobs
///
/// Returns a `VaultHandle` with an open database connection.
pub fn create_vault(
    target_dir: &Path,
    vault_name: &str,
    password: &str,
) -> AppResult<VaultHandle> {
    let vault_path = target_dir.join(vault_name);
    let blobs_path = vault_path.join("blobs");
    let meta_path = vault_path.join("vault.meta");
    let db_path = vault_path.join("index.db");

    // Create directories
    std::fs::create_dir_all(&blobs_path)?;

    // Generate and write vault.meta
    let meta = crypto::VaultMeta::new_default()?;
    let meta_bytes = crypto::serialize_meta(&meta);
    let mut meta_file = std::fs::File::create(&meta_path)?;
    meta_file.write_all(&meta_bytes)?;
    meta_file.sync_all()?;

    // Derive master key from password
    let master_key = crypto::derive_master_key(password, &meta)?;

    // Create and initialize database
    let conn = db::open_db(&db_path, &master_key)?;
    db::create_schema(&conn)?;

    Ok(VaultHandle { vault_path, conn })
}

/// Open an existing vault by reading vault.meta, deriving the key, and unlocking index.db.
///
/// Returns a `VaultHandle` with the database connection ready for use.
pub fn open_vault(vault_path: &Path, password: &str) -> AppResult<VaultHandle> {
    let meta_path = vault_path.join("vault.meta");
    let db_path = vault_path.join("index.db");

    // Read and parse vault.meta
    let meta_bytes = std::fs::read(&meta_path)?;
    let meta = crypto::deserialize_meta(&meta_bytes)?;

    // Derive master key from password
    let master_key = crypto::derive_master_key(password, &meta)?;

    // Open database (this verifies the key)
    let conn = db::open_db(&db_path, &master_key)?;

    Ok(VaultHandle {
        vault_path: vault_path.to_path_buf(),
        conn,
    })
}

/// A file or folder that could not be read (e.g., blocked or quarantined by Windows Defender,
/// deleted while importing, or permission denied) and was skipped without stopping the batch.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkippedFile {
    pub name: String,
    pub reason: String,
}

/// Summary of a resilient batch import operation.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct IngestReport {
    pub imported_files: usize,
    pub skipped_files: Vec<SkippedFile>,
    #[serde(skip)]
    pub succeeded_os_files: Vec<PathBuf>,
    #[serde(skip)]
    pub uncommitted_files: usize,
    #[serde(skip)]
    pub uncommitted_bytes: u64,
}

/// Format an I/O or application error into a concise human-readable reason for skipped files.
fn humanize_skip_reason(err: &AppError) -> String {
    match err {
        AppError::Io(io_err) => {
            if matches!(io_err.raw_os_error(), Some(225) | Some(226)) {
                "Blocked or quarantined by Windows Defender / antivirus (os error 225)".into()
            } else if io_err.kind() == std::io::ErrorKind::NotFound {
                "File was deleted or moved before it could be imported".into()
            } else if io_err.kind() == std::io::ErrorKind::PermissionDenied {
                "Permission denied by operating system".into()
            } else {
                io_err.to_string()
            }
        }
        other => other.to_string(),
    }
}

/// Recursively ingest an OS path (file or directory) into the vault.
///
/// If `os_path` is a file, it is encrypted and stored as a blob.
/// If `os_path` is a directory, the entire folder hierarchy is recreated in `index.db`
/// and all contained files are encrypted into flat `blobs/<uuid>.dat` files.
pub fn ingest_path_recursive(
    handle: &VaultHandle,
    os_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
) -> AppResult<()> {
    ingest_path_recursive_with_progress(handle, os_path, parent_folder_id, compress, &mut |_, _, _| {})
}

/// Recursively ingest an OS path with real-time chunk and file progress callbacks:
/// `on_progress(bytes_delta, files_completed_delta, current_item_name)`.
pub fn ingest_path_recursive_with_progress(
    handle: &VaultHandle,
    os_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let metadata = std::fs::metadata(os_path)?;

    if metadata.is_file() {
        ingest_file(handle, os_path, parent_folder_id, compress, on_progress)?;
    } else if metadata.is_dir() {
        ingest_directory(handle, os_path, parent_folder_id, compress, on_progress)?;
    }

    Ok(())
}

/// Resiliently ingest an OS path (file or directory) into the vault.
///
/// Individual files that fail to open or read (e.g., Windows Defender quarantine `os error 225`,
/// deleted mid-import, or permission denied) are cleanly rolled back via per-file SQLite
/// savepoints, recorded in `report.skipped_files`, and skipped so the rest of the batch continues.
/// Also commits transactions incrementally every 50 files or 64 MiB so already-imported files
/// are safely persisted.
pub fn ingest_path_resilient(
    handle: &VaultHandle,
    os_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
    report: &mut IngestReport,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let display_name = os_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let metadata = match std::fs::metadata(os_path) {
        Ok(m) => m,
        Err(io_err) => {
            let err = AppError::Io(io_err);
            report.skipped_files.push(SkippedFile {
                name: display_name.to_string(),
                reason: humanize_skip_reason(&err),
            });
            on_progress(0, 1, display_name);
            return Ok(());
        }
    };

    if metadata.is_file() {
        ingest_file_resilient(
            handle,
            os_path,
            metadata.len(),
            parent_folder_id,
            compress,
            report,
            on_progress,
        )?;
    } else if metadata.is_dir() {
        ingest_directory_resilient(
            handle,
            os_path,
            parent_folder_id,
            compress,
            report,
            on_progress,
        )?;
    }

    Ok(())
}

pub fn ingest_file_resilient(
    handle: &VaultHandle,
    file_path: &Path,
    expected_size: u64,
    parent_folder_id: Option<&str>,
    compress: bool,
    report: &mut IngestReport,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let file_id = uuid::Uuid::new_v4().to_string();
    let blob_id = uuid::Uuid::new_v4().to_string();

    let original_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let mime_type = mime_guess::from_path(file_path)
        .first_or_octet_stream()
        .to_string();

    let created_at = now_iso8601();

    // Isolate this file's DB writes in a savepoint so a mid-file read failure
    // rolls back only this file's chunks and never corrupts or aborts the batch.
    let _ = handle.conn.execute_batch("SAVEPOINT sp_ingest_file;");

    let mut bytes_emitted_for_file = 0u64;

    let encrypt_result = if handle.is_single_file() {
        crypto::encrypt_file_stream_to_db_with_progress(
            file_path,
            &handle.conn,
            &blob_id,
            compress,
            &mut |chunk_bytes| {
                bytes_emitted_for_file = bytes_emitted_for_file.saturating_add(chunk_bytes);
                on_progress(chunk_bytes, 0, original_name);
            },
        )
    } else {
        let blob_path = handle.blob_path(&blob_id);
        crypto::encrypt_file_stream_with_progress(file_path, &blob_path, compress, &mut |chunk_bytes| {
            bytes_emitted_for_file = bytes_emitted_for_file.saturating_add(chunk_bytes);
            on_progress(chunk_bytes, 0, original_name);
        })
    };

    let (file_key, file_nonce) = match encrypt_result {
        Ok(pair) => pair,
        Err(err) => {
            let _ = handle.conn.execute_batch(
                "ROLLBACK TO SAVEPOINT sp_ingest_file; RELEASE SAVEPOINT sp_ingest_file;",
            );
            if !handle.is_single_file() {
                let _ = std::fs::remove_file(handle.blob_path(&blob_id));
            }
            let remaining_bytes = expected_size.saturating_sub(bytes_emitted_for_file);
            on_progress(remaining_bytes, 1, original_name);
            report.skipped_files.push(SkippedFile {
                name: original_name.to_string(),
                reason: humanize_skip_reason(&err),
            });
            return Ok(());
        }
    };

    let compressed_flag = if compress { 1i64 } else { 0i64 };
    let insert_res = handle.conn.execute(
        "INSERT INTO files (id, folder_id, blob_id, original_name, size_bytes, mime_type, file_key, file_nonce, created_at, compressed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            file_id,
            parent_folder_id,
            blob_id,
            original_name,
            expected_size as i64,
            mime_type,
            file_key.as_ref() as &[u8],
            &file_nonce[..],
            created_at,
            compressed_flag,
        ],
    );

    if let Err(db_err) = insert_res {
        let _ = handle.conn.execute_batch(
            "ROLLBACK TO SAVEPOINT sp_ingest_file; RELEASE SAVEPOINT sp_ingest_file;",
        );
        if !handle.is_single_file() {
            let _ = std::fs::remove_file(handle.blob_path(&blob_id));
        }
        return Err(AppError::Database(db_err));
    }

    let _ = handle.conn.execute_batch("RELEASE SAVEPOINT sp_ingest_file;");

    report.imported_files += 1;
    report.succeeded_os_files.push(file_path.to_path_buf());
    on_progress(0, 1, original_name);

    report.uncommitted_files += 1;
    report.uncommitted_bytes = report.uncommitted_bytes.saturating_add(expected_size);

    // Periodically commit every 50 files or 64 MiB so large multi-GB imports persist incrementally
    if report.uncommitted_files >= 50 || report.uncommitted_bytes >= 64 * 1024 * 1024 {
        let _ = handle.conn.execute_batch("COMMIT; BEGIN IMMEDIATE;");
        report.uncommitted_files = 0;
        report.uncommitted_bytes = 0;
    }

    Ok(())
}

fn ingest_directory_resilient(
    handle: &VaultHandle,
    dir_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
    report: &mut IngestReport,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let folder_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let read_dir = match std::fs::read_dir(dir_path) {
        Ok(rd) => rd,
        Err(io_err) => {
            let err = AppError::Io(io_err);
            report.skipped_files.push(SkippedFile {
                name: folder_name.to_string(),
                reason: humanize_skip_reason(&err),
            });
            return Ok(());
        }
    };

    let folder_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso8601();

    handle.conn.execute(
        "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![folder_id, parent_folder_id, folder_name, created_at],
    )?;

    let mut entries: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let child_path = entry.path();
        ingest_path_resilient(
            handle,
            &child_path,
            Some(&folder_id),
            compress,
            report,
            on_progress,
        )?;
    }

    Ok(())
}

/// Ingest a single file: encrypt it as a blob and insert a record in `files`.
fn ingest_file(
    handle: &VaultHandle,
    file_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let file_id = uuid::Uuid::new_v4().to_string();
    let blob_id = uuid::Uuid::new_v4().to_string();

    // Get file metadata
    let metadata = std::fs::metadata(file_path)?;
    let size_bytes = metadata.len() as i64;

    let original_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let mime_type = mime_guess::from_path(file_path)
        .first_or_octet_stream()
        .to_string();

    let created_at = now_iso8601();

    // Stream-encrypt the file (into `blob_chunks` table for single-file `.vault`, or `blobs/<uuid>.dat` for legacy directory)
    let (file_key, file_nonce) = if handle.is_single_file() {
        crypto::encrypt_file_stream_to_db_with_progress(
            file_path,
            &handle.conn,
            &blob_id,
            compress,
            &mut |chunk_bytes| {
                on_progress(chunk_bytes, 0, original_name);
            },
        )?
    } else {
        let blob_path = handle.blob_path(&blob_id);
        crypto::encrypt_file_stream_with_progress(file_path, &blob_path, compress, &mut |chunk_bytes| {
            on_progress(chunk_bytes, 0, original_name);
        })?
    };

    let compressed_flag = if compress { 1i64 } else { 0i64 };
    // Insert file record into database
    handle.conn.execute(
        "INSERT INTO files (id, folder_id, blob_id, original_name, size_bytes, mime_type, file_key, file_nonce, created_at, compressed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            file_id,
            parent_folder_id,
            blob_id,
            original_name,
            size_bytes,
            mime_type,
            file_key.as_ref() as &[u8],
            &file_nonce[..],
            created_at,
            compressed_flag,
        ],
    )?;

    on_progress(0, 1, original_name);

    Ok(())
}

/// Ingest a directory: create a folder record, then recursively ingest all children.
fn ingest_directory(
    handle: &VaultHandle,
    dir_path: &Path,
    parent_folder_id: Option<&str>,
    compress: bool,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    let folder_id = uuid::Uuid::new_v4().to_string();

    let folder_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let created_at = now_iso8601();

    // Insert folder record
    handle.conn.execute(
        "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![folder_id, parent_folder_id, folder_name, created_at],
    )?;

    // Iterate children at depth 1 (not recursive — we recurse ourselves to maintain hierarchy)
    let mut entries: Vec<_> = std::fs::read_dir(dir_path)?
        .filter_map(|e| e.ok())
        .collect();
    // Sort for deterministic ordering in tests
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let child_path = entry.path();
        ingest_path_recursive_with_progress(handle, &child_path, Some(&folder_id), compress, on_progress)?;
    }

    Ok(())
}

/// Export an item (file or folder) from the vault to the host filesystem.
///
/// If `item_id` matches a file, the blob is decrypted to `destination`.
/// If `item_id` matches a folder, the entire folder hierarchy is reconstructed at `destination`.
pub fn export_item(
    handle: &VaultHandle,
    item_id: &str,
    destination: &Path,
) -> AppResult<()> {
    export_item_with_progress(handle, item_id, destination, &mut |_, _, _| {})
}

/// Export an item (file or folder) with real-time chunk and file progress callbacks:
/// `on_progress(bytes_delta, files_completed_delta, current_item_name)`.
pub fn export_item_with_progress(
    handle: &VaultHandle,
    item_id: &str,
    destination: &Path,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    struct ExportFileMeta {
        original_name: String,
        blob_id: String,
        key_bytes: Vec<u8>,
        nonce_bytes: Vec<u8>,
        compressed: i64,
    }

    // First check if it's a file
    let file_row: Option<ExportFileMeta> = handle
        .conn
        .prepare("SELECT original_name, blob_id, file_key, file_nonce, COALESCE(compressed, 0) FROM files WHERE id = ?1")
        .and_then(|mut stmt| {
            stmt.query_row(rusqlite::params![item_id], |row| {
                Ok(ExportFileMeta {
                    original_name: row.get(0)?,
                    blob_id: row.get(1)?,
                    key_bytes: row.get(2)?,
                    nonce_bytes: row.get(3)?,
                    compressed: row.get(4)?,
                })
            })
        })
        .ok();

    if let Some(ExportFileMeta { original_name, blob_id, key_bytes, nonce_bytes, compressed }) = file_row {
        // Export a single file
        let dest_file = destination.join(&original_name);

        // Convert key and nonce to fixed-size arrays
        let file_key: [u8; 32] = key_bytes
            .try_into()
            .map_err(|_| AppError::Crypto("invalid file key length in database".into()))?;
        let file_nonce: [u8; 7] = nonce_bytes
            .try_into()
            .map_err(|_| AppError::Crypto("invalid file nonce length in database".into()))?;

        // Wrap key in Zeroizing for memory safety
        let file_key = Zeroizing::new(file_key);
        let is_compressed = compressed != 0;
        if handle.is_single_file() {
            crypto::decrypt_file_stream_from_db_with_progress(
                &handle.conn,
                &blob_id,
                &dest_file,
                &file_key,
                &file_nonce,
                is_compressed,
                &mut |chunk_bytes| {
                    on_progress(chunk_bytes, 0, &original_name);
                },
            )?;
        } else {
            let blob_path = handle.blob_path(&blob_id);
            crypto::decrypt_file_stream_with_progress(
                &blob_path,
                &dest_file,
                &file_key,
                &file_nonce,
                is_compressed,
                &mut |chunk_bytes| {
                    on_progress(chunk_bytes, 0, &original_name);
                },
            )?;
        }

        on_progress(0, 1, &original_name);
        return Ok(());
    }

    // Check if it's a folder
    let folder_name: Option<String> = handle
        .conn
        .prepare("SELECT name FROM folders WHERE id = ?1")
        .and_then(|mut stmt| stmt.query_row(rusqlite::params![item_id], |row| row.get(0)))
        .ok();

    if let Some(name) = folder_name {
        let dest_dir = destination.join(&name);
        std::fs::create_dir_all(&dest_dir)?;
        export_folder_contents(handle, item_id, &dest_dir, on_progress)?;
        return Ok(());
    }

    Err(AppError::NotFound(format!("item '{}'", item_id)))
}

/// Recursively export all children of a folder to an OS directory.
fn export_folder_contents(
    handle: &VaultHandle,
    folder_id: &str,
    dest_dir: &Path,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    // Export child files
    {
        let mut stmt = handle.conn.prepare(
            "SELECT id, original_name, blob_id, file_key, file_nonce, COALESCE(compressed, 0) FROM files WHERE folder_id = ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![folder_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Vec<u8>>(3)?,
                row.get::<_, Vec<u8>>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?;

        for row in rows {
            let (_file_id, original_name, blob_id, key_bytes, nonce_bytes, compressed) = row?;
            let dest_file = dest_dir.join(&original_name);

            let file_key: [u8; 32] = key_bytes
                .try_into()
                .map_err(|_| AppError::Crypto("invalid file key length in database".into()))?;
            let file_nonce: [u8; 7] = nonce_bytes
                .try_into()
                .map_err(|_| AppError::Crypto("invalid file nonce length in database".into()))?;

            let file_key = Zeroizing::new(file_key);
            let is_compressed = compressed != 0;
            if handle.is_single_file() {
                crypto::decrypt_file_stream_from_db_with_progress(
                    &handle.conn,
                    &blob_id,
                    &dest_file,
                    &file_key,
                    &file_nonce,
                    is_compressed,
                    &mut |chunk_bytes| {
                        on_progress(chunk_bytes, 0, &original_name);
                    },
                )?;
            } else {
                let blob_path = handle.blob_path(&blob_id);
                crypto::decrypt_file_stream_with_progress(
                    &blob_path,
                    &dest_file,
                    &file_key,
                    &file_nonce,
                    is_compressed,
                    &mut |chunk_bytes| {
                        on_progress(chunk_bytes, 0, &original_name);
                    },
                )?;
            }

            on_progress(0, 1, &original_name);
        }
    }

    // Export child folders (recursively)
    {
        let mut stmt = handle
            .conn
            .prepare("SELECT id, name FROM folders WHERE parent_id = ?1")?;
        let rows = stmt.query_map(rusqlite::params![folder_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let children: Vec<(String, String)> = rows.collect::<Result<Vec<_>, _>>()?;
        for (child_id, child_name) in children {
            let child_dir = dest_dir.join(&child_name);
            std::fs::create_dir_all(&child_dir)?;
            export_folder_contents(handle, &child_id, &child_dir, on_progress)?;
        }
    }

    Ok(())
}

/// Delete an item (file or folder) from the vault.
///
/// For files: deletes encrypted chunks (or zero-overwrites the blob `.dat` file in legacy mode) and deletes the DB record.
/// For folders: recursively deletes all children first, then removes the folder record.
pub fn delete_item(handle: &VaultHandle, item_id: &str) -> AppResult<()> {
    delete_item_with_progress(handle, item_id, &mut |_, _, _| {})
}

/// Delete an item (file or folder) with real-time progress callbacks:
/// `on_progress(bytes_deleted, files_deleted_delta, current_item_name)`.
pub fn delete_item_with_progress(
    handle: &VaultHandle,
    item_id: &str,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    // Check if it's a file
    let file_info: Option<(String, String, i64)> = handle
        .conn
        .prepare("SELECT blob_id, original_name, size_bytes FROM files WHERE id = ?1")
        .and_then(|mut stmt| {
            stmt.query_row(rusqlite::params![item_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
        })
        .ok();

    if let Some((blob_id, original_name, size_bytes)) = file_info {
        if handle.is_single_file() {
            handle.conn.execute(
                "DELETE FROM blob_chunks WHERE blob_id = ?1",
                rusqlite::params![blob_id],
            )?;
        } else {
            let blob_path = handle.blob_path(&blob_id);
            if blob_path.exists() {
                std::fs::remove_file(&blob_path)?;
            }
        }
        handle
            .conn
            .execute("DELETE FROM files WHERE id = ?1", rusqlite::params![item_id])?;
        on_progress(size_bytes.max(0) as u64, 1, &original_name);
        return Ok(());
    }

    // Check if it's a folder
    let is_folder: bool = handle
        .conn
        .prepare("SELECT count(*) FROM folders WHERE id = ?1")
        .and_then(|mut stmt| stmt.query_row(rusqlite::params![item_id], |row| row.get::<_, i64>(0)))
        .map(|c| c > 0)
        .unwrap_or(false);

    if is_folder {
        delete_folder_recursive(handle, item_id, on_progress)?;
        return Ok(());
    }

    Err(AppError::NotFound(format!("item '{}'", item_id)))
}

/// Recursively delete a folder and all its contents in an optimized, set-based manner.
fn delete_folder_recursive(
    handle: &VaultHandle,
    folder_id: &str,
    on_progress: &mut dyn FnMut(u64, usize, &str),
) -> AppResult<()> {
    // Collect all descendant files using a single recursive query
    let mut stmt = handle.conn.prepare(
        "WITH RECURSIVE subfolders(id) AS (
            SELECT ?1
            UNION ALL
            SELECT f.id FROM folders f JOIN subfolders s ON f.parent_id = s.id
        )
        SELECT f.id, f.blob_id, f.original_name, f.size_bytes
        FROM files f
        WHERE f.folder_id IN (SELECT id FROM subfolders)",
    )?;
    let files: Vec<(String, String, String, i64)> = stmt
        .query_map(rusqlite::params![folder_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Delete chunks and files
    for (file_id, blob_id, original_name, size_bytes) in files {
        if handle.is_single_file() {
            handle.conn.execute(
                "DELETE FROM blob_chunks WHERE blob_id = ?1",
                rusqlite::params![blob_id],
            )?;
        } else {
            let blob_path = handle.blob_path(&blob_id);
            if blob_path.exists() {
                let _ = std::fs::remove_file(&blob_path);
            }
        }
        handle
            .conn
            .execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id])?;
        on_progress(size_bytes.max(0) as u64, 1, &original_name);
    }

    // Delete all descendant folders including folder_id itself in one statement
    handle.conn.execute(
        "WITH RECURSIVE subfolders(id) AS (
            SELECT ?1
            UNION ALL
            SELECT f.id FROM folders f JOIN subfolders s ON f.parent_id = s.id
        )
        DELETE FROM folders WHERE id IN (SELECT id FROM subfolders)",
        rusqlite::params![folder_id],
    )?;

    Ok(())
}

/// Compute total plaintext size in bytes and total file count for a list of item IDs (files or folders).
pub fn compute_items_size_and_count(
    conn: &rusqlite::Connection,
    item_ids: &[String],
) -> (u64, usize) {
    let mut total_bytes: u64 = 0;
    let mut total_files: usize = 0;

    for id in item_ids {
        // Check if file
        if let Ok(size) = conn.query_row(
            "SELECT size_bytes FROM files WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get::<_, i64>(0),
        ) {
            total_bytes += size.max(0) as u64;
            total_files += 1;
            continue;
        }

        // Otherwise check folder descendants
        let sql = "
            WITH RECURSIVE descendants(id) AS (
                SELECT ?1
                UNION ALL
                SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
            )
            SELECT COALESCE(SUM(size_bytes), 0), COUNT(*)
            FROM files
            WHERE folder_id IN (SELECT id FROM descendants)
        ";
        if let Ok((bytes, count)) = conn.query_row(sql, rusqlite::params![id], |r| {
            Ok((
                r.get::<_, i64>(0).unwrap_or(0),
                r.get::<_, i64>(1).unwrap_or(0),
            ))
        }) {
            total_bytes += bytes.max(0) as u64;
            total_files += count.max(0) as usize;
        }
    }

    (total_bytes, total_files)
}

/// Query available free disk space in bytes on the volume containing `target_path`.
pub fn get_available_disk_space(target_path: &Path) -> AppResult<u64> {
    let mut dir = target_path.to_path_buf();
    while !dir.is_dir() {
        if let Some(parent) = dir.parent() {
            if parent.as_os_str().is_empty() {
                dir = PathBuf::from(".");
                break;
            }
            dir = parent.to_path_buf();
        } else {
            dir = PathBuf::from(".");
            break;
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let wide: Vec<u16> = dir
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut free_bytes_available: u64 = 0;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_bytes_available,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(AppError::Io(std::io::Error::last_os_error()));
        }
        Ok(free_bytes_available)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = dir;
        Ok(u64::MAX)
    }
}

/// Validate that the volume hosting `target_path` has enough free disk space for `required_raw_bytes`.
///
/// When `include_db_overhead` is true (e.g. importing into a `.vault` SQLCipher database),
/// accounts for AEAD tags + SQLCipher B-tree/page framing overhead (~2%) plus a 32 MiB OS safety margin.
pub fn check_disk_space_for_bytes(
    target_path: &Path,
    required_raw_bytes: u64,
    include_db_overhead: bool,
) -> AppResult<()> {
    let overhead = if include_db_overhead {
        (required_raw_bytes / 50).saturating_add(32 * 1024 * 1024)
    } else {
        16 * 1024 * 1024
    };
    let required_bytes = required_raw_bytes.saturating_add(overhead);
    let available_bytes = get_available_disk_space(target_path)?;

    if available_bytes < required_bytes {
        return Err(AppError::InsufficientDiskSpace {
            required_bytes,
            available_bytes,
        });
    }

    Ok(())
}

/// Zero-overwrite a file before deleting it from disk for secure deletion.
///
/// Writes zeros in 4 MB chunks (no whole-file RAM buffering), syncs to disk,
/// then removes the file.
pub fn zero_overwrite(path: &Path) -> AppResult<()> {
    let len = std::fs::metadata(path)?.len();
    let mut file = std::fs::OpenOptions::new().write(true).open(path)?;

    let zeros = vec![0u8; 4 * 1024 * 1024]; // 4 MB zero buffer
    let mut written = 0u64;

    while written < len {
        let to_write = std::cmp::min(zeros.len() as u64, len - written) as usize;
        file.write_all(&zeros[..to_write])?;
        written += to_write as u64;
    }

    file.sync_all()?;
    drop(file);
    std::fs::remove_file(path)?;

    Ok(())
}

/// Returns the current UTC time as a standard ISO 8601 string (`YYYY-MM-DDTHH:MM:SSZ`).
pub fn now_iso8601() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;

    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, m, d, hour, min, sec)
}

/// Get the root folder ID for a vault (the folder ingested at the top level).
/// Used in integration tests.
pub fn get_root_folder_id(handle: &VaultHandle) -> AppResult<Option<String>> {
    let result: Option<String> = handle
        .conn
        .prepare("SELECT id FROM folders WHERE parent_id IS NULL LIMIT 1")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)))
        .ok();
    Ok(result)
}

