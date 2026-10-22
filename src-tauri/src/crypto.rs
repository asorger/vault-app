// crypto.rs — Vault metadata binary format, key derivation, and stream encryption/decryption.
//
// AGENTS.md compliance:
// - Zero whole-file RAM buffering: 4 MB chunked streaming with ChaCha20Poly1305 StreamBE32
// - Memory hygiene: all keys and passwords wrapped in Zeroizing
// - No .unwrap() / .expect() — all operations return AppResult

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32, NewStream, StreamBE32, StreamPrimitive};
use chacha20poly1305::aead::KeyInit;
use chacha20poly1305::ChaCha20Poly1305;
use rand::RngCore;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

/// 4 MB chunk size for streaming encryption/decryption.
pub const CHUNK_SIZE: usize = 4 * 1024 * 1024;

/// Poly1305 authentication tag appended to each encrypted chunk.
pub const TAG_SIZE: usize = 16;

/// Magic bytes identifying a vault metadata file.
const MAGIC: &[u8; 4] = b"VLT1";

/// Current vault format version.
const VERSION: u8 = 1;

/// Total serialized size of VaultMeta (4 magic + 1 version + 4 mem + 4 iter + 4 par + 32 salt = 49).
const META_SIZE: usize = 49;

/// Binary metadata header stored in `vault.meta`.
#[derive(Debug, Clone)]
pub struct VaultMeta {
    pub version: u8,
    /// Argon2id memory cost in KiB (65536 = 64 MB).
    pub argon2_memory_kib: u32,
    /// Argon2id iteration count (time cost).
    pub argon2_iterations: u32,
    /// Argon2id parallelism (lanes).
    pub argon2_parallelism: u32,
    /// 32-byte random salt for key derivation.
    pub salt: [u8; 32],
}

impl VaultMeta {
    /// Create a new VaultMeta with default Argon2id parameters and a fresh random salt.
    pub fn new_default() -> AppResult<Self> {
        let mut salt = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut salt);
        Ok(Self {
            version: VERSION,
            argon2_memory_kib: 65536, // 64 MB
            argon2_iterations: 3,
            argon2_parallelism: 4,
            salt,
        })
    }
}

/// Serialize a VaultMeta to a 49-byte binary representation.
pub fn serialize_meta(meta: &VaultMeta) -> Vec<u8> {
    let mut buf = Vec::with_capacity(META_SIZE);
    buf.extend_from_slice(MAGIC);
    buf.push(meta.version);
    buf.extend_from_slice(&meta.argon2_memory_kib.to_le_bytes());
    buf.extend_from_slice(&meta.argon2_iterations.to_le_bytes());
    buf.extend_from_slice(&meta.argon2_parallelism.to_le_bytes());
    buf.extend_from_slice(&meta.salt);
    buf
}

/// Deserialize a VaultMeta from bytes, validating magic bytes and version.
pub fn deserialize_meta(data: &[u8]) -> AppResult<VaultMeta> {
    if data.len() < META_SIZE {
        return Err(AppError::VaultFormat(format!(
            "vault.meta too short: expected {} bytes, got {}",
            META_SIZE,
            data.len()
        )));
    }
    if &data[0..4] != MAGIC {
        return Err(AppError::VaultFormat(
            "invalid magic bytes — not a vault file".into(),
        ));
    }
    let version = data[4];
    if version != VERSION {
        return Err(AppError::VaultFormat(format!(
            "unsupported vault version: {}",
            version
        )));
    }
    let argon2_memory_kib = u32::from_le_bytes([data[5], data[6], data[7], data[8]]);
    let argon2_iterations = u32::from_le_bytes([data[9], data[10], data[11], data[12]]);
    let argon2_parallelism = u32::from_le_bytes([data[13], data[14], data[15], data[16]]);
    let mut salt = [0u8; 32];
    salt.copy_from_slice(&data[17..49]);

    Ok(VaultMeta {
        version,
        argon2_memory_kib,
        argon2_iterations,
        argon2_parallelism,
        salt,
    })
}

/// Derive a 32-byte master key from a password and vault metadata using Argon2id.
///
/// The result is wrapped in `Zeroizing` so the key is automatically zeroed when dropped.
pub fn derive_master_key(password: &str, meta: &VaultMeta) -> AppResult<Zeroizing<[u8; 32]>> {
    let params = argon2::Params::new(
        meta.argon2_memory_kib,
        meta.argon2_iterations,
        meta.argon2_parallelism,
        Some(32),
    )
    .map_err(|e| AppError::Crypto(format!("invalid Argon2 params: {}", e)))?;

    let argon2 = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

    let mut key = Zeroizing::new([0u8; 32]);
    argon2
        .hash_password_into(password.as_bytes(), &meta.salt, key.as_mut())
        .map_err(|e| AppError::Crypto(format!("Argon2 hashing failed: {}", e)))?;

    Ok(key)
}

/// Derive a 32-byte master key from a password and a 16-byte SQLCipher header salt using Argon2id.
///
/// Used by the single-file `.vault` format where the 16-byte salt is stored in bytes `0..16`
/// of the SQLCipher `.vault` file itself.
pub fn derive_master_key_with_salt16(
    password: &str,
    salt16: &[u8; 16],
) -> AppResult<Zeroizing<[u8; 32]>> {
    let params = argon2::Params::new(
        65536, // 64 MiB
        3,     // 3 iterations
        4,     // 4 lanes
        Some(32),
    )
    .map_err(|e| AppError::Crypto(format!("invalid Argon2 params: {}", e)))?;

    let argon2 = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

    let mut key = Zeroizing::new([0u8; 32]);
    argon2
        .hash_password_into(password.as_bytes(), salt16, key.as_mut())
        .map_err(|e| AppError::Crypto(format!("Argon2 hashing failed: {}", e)))?;

    Ok(key)
}

/// Stream-encrypt a file in 4 MB chunks using ChaCha20Poly1305 with StreamBE32.
///
/// Returns true if the file extension is known to already be compressed.
/// Compressing these formats wastes CPU time on low-spec PCs with negligible or negative size gains.
pub fn is_already_compressed_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "m4v"
        | "zip" | "7z" | "rar" | "gz" | "bz2" | "xz" | "zst"
        | "jpg" | "jpeg" | "png" | "webp" | "gif"
        | "mp3" | "flac" | "ogg" | "m4a" | "aac"
        | "pdf"
    )
}

/// Prepares a plaintext chunk for encryption, transparently applying Zstandard (level 3)
/// compression if `compress` is true and the compressed data is actually smaller.
/// If `skip_zstd` is true (e.g., for pre-compressed file extensions), it skips `zstd::encode_all`
/// and directly frames the payload with `0x00`.
///
/// Framing:
/// - If `compress` is true:
///   - If compressed size + 1 < raw size: `[0x01, ...zstd_data]`
///   - Otherwise: `[0x00, ...raw_data]`
/// - If `compress` is false: raw chunk bytes without header (100% legacy compatible).
pub fn prepare_chunk_payload(raw_chunk: &[u8], compress: bool, skip_zstd: bool) -> AppResult<Vec<u8>> {
    if !compress {
        return Ok(raw_chunk.to_vec());
    }
    if raw_chunk.is_empty() {
        return Ok(vec![0u8]);
    }
    if skip_zstd {
        let mut framed = Vec::with_capacity(raw_chunk.len() + 1);
        framed.push(0u8);
        framed.extend_from_slice(raw_chunk);
        return Ok(framed);
    }
    match zstd::encode_all(raw_chunk, 3) {
        Ok(comp) if comp.len() + 1 < raw_chunk.len() => {
            let mut framed = Vec::with_capacity(comp.len() + 1);
            framed.push(1u8);
            framed.extend_from_slice(&comp);
            Ok(framed)
        }
        _ => {
            let mut framed = Vec::with_capacity(raw_chunk.len() + 1);
            framed.push(0u8);
            framed.extend_from_slice(raw_chunk);
            Ok(framed)
        }
    }
}

/// Unpacks a decrypted AEAD chunk payload, decompressing via Zstandard if compressed.
pub fn unpack_chunk_payload(decrypted_chunk: &[u8], compressed: bool) -> AppResult<Vec<u8>> {
    if !compressed {
        return Ok(decrypted_chunk.to_vec());
    }
    if decrypted_chunk.is_empty() {
        return Ok(Vec::new());
    }
    let flag = decrypted_chunk[0];
    let payload = &decrypted_chunk[1..];
    if flag == 1 {
        zstd::decode_all(payload)
            .map_err(|e| AppError::Crypto(format!("zstd decompression failed: {}", e)))
    } else {
        Ok(payload.to_vec())
    }
}

/// Stream-encrypt a file in 4 MB chunks using ChaCha20Poly1305 with StreamBE32.
/// Generates a fresh random 32-byte key and 7-byte nonce for this file.
/// Writes the encrypted ciphertext to `dest_path`.
///
/// Returns `(file_key, file_nonce)` — the caller must store these in `index.db`.
/// The key is wrapped in `Zeroizing` for automatic memory cleanup.
pub fn encrypt_file_stream(
    src_path: &Path,
    dest_path: &Path,
    compress: bool,
) -> AppResult<(Zeroizing<[u8; 32]>, [u8; 7])> {
    encrypt_file_stream_with_progress(src_path, dest_path, compress, &mut |_| {})
}

/// Stream-encrypt a file in 4 MB chunks while reporting plaintext chunk bytes processed via `on_chunk`.
pub fn encrypt_file_stream_with_progress(
    src_path: &Path,
    dest_path: &Path,
    compress: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<(Zeroizing<[u8; 32]>, [u8; 7])> {
    // Generate per-file random key (32 bytes)
    let mut key_bytes = Zeroizing::new([0u8; 32]);
    rand::thread_rng().fill_bytes(key_bytes.as_mut());

    // Generate per-file stream nonce (7 bytes — StreamBE32 reserves 5 of the 12-byte nonce)
    let mut nonce = [0u8; 7];
    rand::thread_rng().fill_bytes(&mut nonce);

    encrypt_file_stream_with_key(src_path, dest_path, &key_bytes, &nonce, compress, on_chunk)?;

    Ok((key_bytes, nonce))
}

/// Internal: encrypt using a provided key and nonce (used by encrypt_file_stream and tests).
fn encrypt_file_stream_with_key(
    src_path: &Path,
    dest_path: &Path,
    key: &[u8; 32],
    nonce: &[u8; 7],
    compress: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let mut encryptor = EncryptorBE32::from_aead(cipher, nonce.into());

    let mut src_file = std::fs::File::open(src_path)?;
    let mut dest_file = std::fs::File::create(dest_path)?;

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let skip_zstd = compress && is_already_compressed_extension(ext);

    // We use a two-buffer strategy:
    // - `current` holds the chunk we're about to process
    // - We read ahead into `current` to know whether more data follows
    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut current_len = fill_buffer(&mut src_file, &mut buffer)?;

    // Handle empty file case
    if current_len == 0 {
        let payload = prepare_chunk_payload(&[][..], compress, skip_zstd)?;
        let ciphertext = encryptor
            .encrypt_last(payload.as_slice())
            .map_err(|e| AppError::Crypto(format!("encrypt_last failed: {}", e)))?;
        dest_file.write_all(&ciphertext)?;
        dest_file.sync_all()?;
        return Ok(());
    }

    loop {
        // Try to read the next chunk to determine if current is the last
        let mut next_buffer = vec![0u8; CHUNK_SIZE];
        let next_len = fill_buffer(&mut src_file, &mut next_buffer)?;

        let payload = prepare_chunk_payload(&buffer[..current_len], compress, skip_zstd)?;
        if next_len == 0 {
            // current is the last chunk
            let ciphertext = encryptor
                .encrypt_last(payload.as_slice())
                .map_err(|e| AppError::Crypto(format!("encrypt_last failed: {}", e)))?;
            dest_file.write_all(&ciphertext)?;
            on_chunk(current_len as u64);
            break;
        } else {
            // current is an intermediate chunk
            let ciphertext = encryptor
                .encrypt_next(payload.as_slice())
                .map_err(|e| AppError::Crypto(format!("encrypt_next failed: {}", e)))?;
            dest_file.write_all(&ciphertext)?;
            on_chunk(current_len as u64);

            // Move next → current for next iteration
            buffer[..next_len].copy_from_slice(&next_buffer[..next_len]);
            current_len = next_len;
        }
    }

    dest_file.sync_all()?;
    Ok(())
}

/// Stream-decrypt a file in chunks using ChaCha20Poly1305 with StreamBE32.
///
/// Reads encrypted data from `src_path` and writes plaintext to `dest_path`.
/// The `file_key` and `file_nonce` must match those returned by `encrypt_file_stream`.
pub fn decrypt_file_stream(
    src_path: &Path,
    dest_path: &Path,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
) -> AppResult<()> {
    decrypt_file_stream_with_progress(src_path, dest_path, file_key, file_nonce, compressed, &mut |_| {})
}

/// Stream-decrypt a file in chunks while reporting decrypted plaintext chunk bytes via `on_chunk`.
pub fn decrypt_file_stream_with_progress(
    src_path: &Path,
    dest_path: &Path,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let mut dest_file = std::fs::File::create(dest_path)?;
    decrypt_file_stream_to_writer_with_progress(
        src_path,
        &mut dest_file,
        file_key,
        file_nonce,
        compressed,
        on_chunk,
    )?;
    dest_file.sync_all()?;
    Ok(())
}

/// Stream-decrypt a file in chunks directly into an arbitrary `Write` sink (e.g. file or in-memory buffer).
pub fn decrypt_file_stream_to_writer<W: Write>(
    src_path: &Path,
    writer: &mut W,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
) -> AppResult<()> {
    decrypt_file_stream_to_writer_with_progress(src_path, writer, file_key, file_nonce, compressed, &mut |_| {})
}

fn decrypt_file_stream_to_writer_with_progress<W: Write>(
    src_path: &Path,
    writer: &mut W,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let cipher = ChaCha20Poly1305::new(file_key.into());
    let mut decryptor = DecryptorBE32::from_aead(cipher, file_nonce.into());

    let mut src_file = std::fs::File::open(src_path)?;

    // Each ciphertext chunk = CHUNK_SIZE plaintext + TAG_SIZE tag
    let ct_chunk_size = CHUNK_SIZE + TAG_SIZE;
    let mut buffer = vec![0u8; ct_chunk_size];
    let mut current_len = fill_buffer(&mut src_file, &mut buffer)?;

    if current_len == 0 {
        return Ok(());
    }

    loop {
        let mut next_buffer = vec![0u8; ct_chunk_size];
        let next_len = fill_buffer(&mut src_file, &mut next_buffer)?;

        if next_len == 0 {
            // current is the last chunk
            let decrypted = decryptor
                .decrypt_last(&buffer[..current_len])
                .map_err(|e| AppError::Crypto(format!("decrypt_last failed: {}", e)))?;
            let plaintext = unpack_chunk_payload(&decrypted, compressed)?;
            writer.write_all(&plaintext)?;
            on_chunk(plaintext.len() as u64);
            break;
        } else {
            // current is an intermediate chunk
            let decrypted = decryptor
                .decrypt_next(&buffer[..current_len])
                .map_err(|e| AppError::Crypto(format!("decrypt_next failed: {}", e)))?;
            let plaintext = unpack_chunk_payload(&decrypted, compressed)?;
            writer.write_all(&plaintext)?;
            on_chunk(plaintext.len() as u64);

            buffer[..next_len].copy_from_slice(&next_buffer[..next_len]);
            current_len = next_len;
        }
    }

    Ok(())
}

/// Random-access decryption of a byte range `[start..=end]` from an encrypted blob file.
///
/// Seeks directly to the 4 MB encrypted chunk(s) containing `[start..=end]`, decrypts only
/// those chunk(s) using `StreamBE32`, and returns the requested plaintext slice.
pub fn decrypt_file_range(
    src_path: &Path,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    total_plaintext_size: u64,
    compressed: bool,
    start: u64,
    end: u64,
) -> AppResult<Vec<u8>> {
    if total_plaintext_size == 0 || start > end || start >= total_plaintext_size {
        return Ok(Vec::new());
    }

    let clamped_end = end.min(total_plaintext_size - 1);
    let chunk_size_u64 = CHUNK_SIZE as u64;
    let ct_chunk_size_u64 = (CHUNK_SIZE + TAG_SIZE) as u64;
    let total_chunks = total_plaintext_size.div_ceil(chunk_size_u64);

    let start_chunk = start / chunk_size_u64;
    let end_chunk = clamped_end / chunk_size_u64;

    let cipher = ChaCha20Poly1305::new(file_key.into());
    let stream = StreamBE32::from_aead(cipher, file_nonce.into());

    let mut src_file = std::fs::File::open(src_path)?;
    let mut output = Vec::with_capacity((clamped_end - start + 1) as usize);

    for chunk_idx in start_chunk..=end_chunk {
        let is_last = chunk_idx + 1 == total_chunks;
        let expected_pt_len = if is_last {
            let rem = (total_plaintext_size % chunk_size_u64) as usize;
            if rem == 0 {
                CHUNK_SIZE
            } else {
                rem
            }
        } else {
            CHUNK_SIZE
        };
        let expected_ct_len = expected_pt_len + TAG_SIZE;

        let file_offset = chunk_idx * ct_chunk_size_u64;
        src_file.seek(SeekFrom::Start(file_offset))?;

        let mut ct_buf = vec![0u8; expected_ct_len];
        let n = fill_buffer(&mut src_file, &mut ct_buf)?;

        let decrypted = stream
            .decrypt(chunk_idx as u32, is_last, &ct_buf[..n])
            .map_err(|e| AppError::Crypto(format!("range chunk decrypt failed: {}", e)))?;

        let plaintext = unpack_chunk_payload(&decrypted, compressed)?;

        let chunk_pt_start = chunk_idx * chunk_size_u64;
        let slice_start = start.saturating_sub(chunk_pt_start) as usize;
        let slice_end = ((clamped_end - chunk_pt_start) as usize + 1).min(plaintext.len());

        if slice_start < slice_end {
            output.extend_from_slice(&plaintext[slice_start..slice_end]);
        }
    }

    Ok(output)
}

/// Stream-encrypt a file in 4 MB chunks using ChaCha20Poly1305 with StreamBE32,
/// storing each encrypted chunk as a row in the `blob_chunks` table inside the single-file `.vault` DB.
pub fn encrypt_file_stream_to_db(
    src_path: &Path,
    conn: &rusqlite::Connection,
    blob_id: &str,
    compress: bool,
) -> AppResult<(Zeroizing<[u8; 32]>, [u8; 7])> {
    encrypt_file_stream_to_db_with_progress(src_path, conn, blob_id, compress, &mut |_| {})
}

/// Stream-encrypt a file in 4 MB chunks into `blob_chunks` while reporting plaintext chunk bytes via `on_chunk`.
pub fn encrypt_file_stream_to_db_with_progress(
    src_path: &Path,
    conn: &rusqlite::Connection,
    blob_id: &str,
    compress: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<(Zeroizing<[u8; 32]>, [u8; 7])> {
    let mut key_bytes = Zeroizing::new([0u8; 32]);
    rand::thread_rng().fill_bytes(key_bytes.as_mut());

    let mut nonce = [0u8; 7];
    rand::thread_rng().fill_bytes(&mut nonce);

    let cipher = ChaCha20Poly1305::new((&*key_bytes).into());
    let mut encryptor = EncryptorBE32::from_aead(cipher, (&nonce).into());

    let mut src_file = std::fs::File::open(src_path)?;

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let skip_zstd = compress && is_already_compressed_extension(ext);

    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut current_len = fill_buffer(&mut src_file, &mut buffer)?;

    let mut stmt = conn.prepare(
        "INSERT INTO blob_chunks (blob_id, chunk_index, data) VALUES (?1, ?2, ?3)",
    )?;

    if current_len == 0 {
        let payload = prepare_chunk_payload(&[][..], compress, skip_zstd)?;
        let ciphertext = encryptor
            .encrypt_last(payload.as_slice())
            .map_err(|e| AppError::Crypto(format!("encrypt_last failed: {}", e)))?;
        stmt.execute(rusqlite::params![blob_id, 0i64, ciphertext])?;
        return Ok((key_bytes, nonce));
    }

    let mut chunk_idx: i64 = 0;
    loop {
        let mut next_buffer = vec![0u8; CHUNK_SIZE];
        let next_len = fill_buffer(&mut src_file, &mut next_buffer)?;

        let payload = prepare_chunk_payload(&buffer[..current_len], compress, skip_zstd)?;
        if next_len == 0 {
            let ciphertext = encryptor
                .encrypt_last(payload.as_slice())
                .map_err(|e| AppError::Crypto(format!("encrypt_last failed: {}", e)))?;
            stmt.execute(rusqlite::params![blob_id, chunk_idx, ciphertext])?;
            on_chunk(current_len as u64);
            break;
        } else {
            let ciphertext = encryptor
                .encrypt_next(payload.as_slice())
                .map_err(|e| AppError::Crypto(format!("encrypt_next failed: {}", e)))?;
            stmt.execute(rusqlite::params![blob_id, chunk_idx, ciphertext])?;
            on_chunk(current_len as u64);
            chunk_idx += 1;

            buffer[..next_len].copy_from_slice(&next_buffer[..next_len]);
            current_len = next_len;
        }
    }

    Ok((key_bytes, nonce))
}

/// Stream-decrypt a file in 4 MB chunks from the `blob_chunks` table inside the single-file `.vault` DB
/// directly to `dest_path`.
pub fn decrypt_file_stream_from_db(
    conn: &rusqlite::Connection,
    blob_id: &str,
    dest_path: &Path,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
) -> AppResult<()> {
    decrypt_file_stream_from_db_with_progress(
        conn,
        blob_id,
        dest_path,
        file_key,
        file_nonce,
        compressed,
        &mut |_| {},
    )
}

/// Stream-decrypt a file in 4 MB chunks from `blob_chunks` while reporting decrypted plaintext chunk bytes via `on_chunk`.
pub fn decrypt_file_stream_from_db_with_progress(
    conn: &rusqlite::Connection,
    blob_id: &str,
    dest_path: &Path,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    compressed: bool,
    on_chunk: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let total_chunks: i64 = conn.query_row(
        "SELECT COUNT(*) FROM blob_chunks WHERE blob_id = ?1",
        rusqlite::params![blob_id],
        |r| r.get(0),
    )?;

    let mut dest_file = std::fs::File::create(dest_path)?;
    if total_chunks == 0 {
        dest_file.sync_all()?;
        return Ok(());
    }

    let cipher = ChaCha20Poly1305::new(file_key.into());
    let mut decryptor = DecryptorBE32::from_aead(cipher, file_nonce.into());

    let mut stmt = conn.prepare(
        "SELECT data FROM blob_chunks WHERE blob_id = ?1 ORDER BY chunk_index ASC",
    )?;
    let mut rows = stmt.query(rusqlite::params![blob_id])?;

    let mut idx = 0i64;
    while let Some(row) = rows.next()? {
        let ct_buf: Vec<u8> = row.get(0)?;
        idx += 1;
        let is_last = idx == total_chunks;
        if is_last {
            let decrypted = decryptor
                .decrypt_last(ct_buf.as_slice())
                .map_err(|e| AppError::Crypto(format!("decrypt_last failed: {}", e)))?;
            let plaintext = unpack_chunk_payload(&decrypted, compressed)?;
            dest_file.write_all(&plaintext)?;
            on_chunk(plaintext.len() as u64);
            break;
        } else {
            let decrypted = decryptor
                .decrypt_next(ct_buf.as_slice())
                .map_err(|e| AppError::Crypto(format!("decrypt_next failed: {}", e)))?;
            let plaintext = unpack_chunk_payload(&decrypted, compressed)?;
            dest_file.write_all(&plaintext)?;
            on_chunk(plaintext.len() as u64);
        }
    }

    dest_file.sync_all()?;
    Ok(())
}

/// Random-access decryption of a byte range `[start..=end]` from the `blob_chunks` table
/// inside a single-file `.vault` DB.
#[allow(clippy::too_many_arguments)]
pub fn decrypt_file_range_from_db(
    conn: &rusqlite::Connection,
    blob_id: &str,
    file_key: &[u8; 32],
    file_nonce: &[u8; 7],
    total_plaintext_size: u64,
    compressed: bool,
    start: u64,
    end: u64,
) -> AppResult<Vec<u8>> {
    if total_plaintext_size == 0 || start > end || start >= total_plaintext_size {
        return Ok(Vec::new());
    }

    let clamped_end = end.min(total_plaintext_size - 1);
    let chunk_size_u64 = CHUNK_SIZE as u64;
    let total_chunks = total_plaintext_size.div_ceil(chunk_size_u64);

    let start_chunk = start / chunk_size_u64;
    let end_chunk = clamped_end / chunk_size_u64;

    let cipher = ChaCha20Poly1305::new(file_key.into());
    let stream = StreamBE32::from_aead(cipher, file_nonce.into());

    let mut stmt = conn.prepare(
        "SELECT data FROM blob_chunks WHERE blob_id = ?1 AND chunk_index = ?2",
    )?;
    let mut output = Vec::with_capacity((clamped_end - start + 1) as usize);

    for chunk_idx in start_chunk..=end_chunk {
        let is_last = chunk_idx + 1 == total_chunks;
        let ct_buf: Vec<u8> = stmt
            .query_row(rusqlite::params![blob_id, chunk_idx as i64], |r| r.get(0))
            .map_err(|_| AppError::NotFound(format!("Chunk {} of blob {}", chunk_idx, blob_id)))?;

        let decrypted = stream
            .decrypt(chunk_idx as u32, is_last, ct_buf.as_slice())
            .map_err(|e| AppError::Crypto(format!("range chunk decrypt failed: {}", e)))?;

        let plaintext = unpack_chunk_payload(&decrypted, compressed)?;

        let chunk_pt_start = chunk_idx * chunk_size_u64;
        let slice_start = start.saturating_sub(chunk_pt_start) as usize;
        let slice_end = ((clamped_end - chunk_pt_start) as usize + 1).min(plaintext.len());

        if slice_start < slice_end {
            output.extend_from_slice(&plaintext[slice_start..slice_end]);
        }
    }

    Ok(output)
}

/// Fill a buffer completely from a reader, returning the number of bytes read.
/// Returns less than `buf.len()` only at EOF.
fn fill_buffer<R: Read>(reader: &mut R, buf: &mut [u8]) -> AppResult<usize> {
    let mut total = 0;
    while total < buf.len() {
        match reader.read(&mut buf[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(AppError::Io(e)),
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meta_roundtrip() {
        let meta = VaultMeta {
            version: 1,
            argon2_memory_kib: 65536,
            argon2_iterations: 3,
            argon2_parallelism: 4,
            salt: [42u8; 32],
        };
        let serialized = serialize_meta(&meta);
        assert_eq!(serialized.len(), META_SIZE);

        let deserialized = deserialize_meta(&serialized).unwrap();
        assert_eq!(deserialized.version, 1);
        assert_eq!(deserialized.argon2_memory_kib, 65536);
        assert_eq!(deserialized.argon2_iterations, 3);
        assert_eq!(deserialized.argon2_parallelism, 4);
        assert_eq!(deserialized.salt, [42u8; 32]);
    }

    #[test]
    fn test_meta_bad_magic() {
        let mut data = serialize_meta(&VaultMeta {
            version: 1,
            argon2_memory_kib: 65536,
            argon2_iterations: 3,
            argon2_parallelism: 4,
            salt: [0u8; 32],
        });
        data[0] = b'X';
        assert!(deserialize_meta(&data).is_err());
    }
}

