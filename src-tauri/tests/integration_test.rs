// Integration tests for the vault storage and cryptography engine.
//
// These tests create real vault directories in temp folders, ingest nested file
// hierarchies, lock/reopen vaults, export and verify SHA-256 hashes, and test
// secure deletion.
//
// Run with: cargo test -- --nocapture

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

use vault_app_lib::crypto;
use vault_app_lib::db;
use vault_app_lib::vfs;

/// Reduce Argon2 cost for tests to keep them fast.
/// We create a custom meta with minimal parameters.
fn create_test_vault(target_dir: &Path, name: &str, password: &str) -> vfs::VaultHandle {
    // We use the real create_vault which uses production Argon2 params.
    // For tests to run in reasonable time, we'll accept ~1-2 second key derivation.
    vfs::create_vault(target_dir, name, password).expect("create_vault should succeed")
}

/// Create a test directory tree with known content:
/// ```
/// test_data/
/// ├── readme.txt          (small text file)
/// ├── subdir/
/// │   ├── image.bin        (random binary file, ~5 MB)
/// │   └── nested/
/// │       └── deep.txt     (another text file)
/// ```
fn create_test_data(parent: &Path) -> PathBuf {
    let data_dir = parent.join("test_data");
    let subdir = data_dir.join("subdir");
    let nested = subdir.join("nested");

    fs::create_dir_all(&nested).unwrap();

    // readme.txt — small text
    fs::write(
        data_dir.join("readme.txt"),
        "Hello, this is a test file for vault encryption.\nLine 2.\nLine 3 with unicode: 🔐\n",
    )
    .unwrap();

    // image.bin — 5 MB of pseudo-random data
    let mut rng = rand::thread_rng();
    let mut big_data = vec![0u8; 5 * 1024 * 1024];
    rand::RngCore::fill_bytes(&mut rng, &mut big_data);
    fs::write(subdir.join("image.bin"), &big_data).unwrap();

    // deep.txt — another text file
    fs::write(
        nested.join("deep.txt"),
        "Deeply nested file.\nThis tests recursive folder ingestion.\n",
    )
    .unwrap();

    data_dir
}

/// Compute the SHA-256 hash of a file (streaming, not loading into memory).
fn sha256_file(path: &Path) -> String {
    let mut file = fs::File::open(path).expect("failed to open file for hashing");
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer).expect("read error");
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    format!("{:x}", hasher.finalize())
}

/// Recursively collect relative paths → SHA-256 hashes for all files under `root`.
fn collect_file_hashes(root: &Path) -> HashMap<PathBuf, String> {
    let mut hashes = HashMap::new();
    collect_hashes_recursive(root, root, &mut hashes);
    hashes
}

fn collect_hashes_recursive(base: &Path, current: &Path, map: &mut HashMap<PathBuf, String>) {
    for entry in fs::read_dir(current).expect("read_dir failed") {
        let entry = entry.expect("dir entry error");
        let path = entry.path();
        if path.is_file() {
            let rel = path.strip_prefix(base).unwrap().to_path_buf();
            map.insert(rel, sha256_file(&path));
        } else if path.is_dir() {
            collect_hashes_recursive(base, &path, map);
        }
    }
}

// =============================================================================
// Test 1: Create and open a vault, verify directory structure
// =============================================================================
#[test]
fn test_create_and_open_vault() {
    let tmp = TempDir::new().unwrap();
    let password = "test-password-123";

    // Create vault
    let handle = create_test_vault(tmp.path(), "TestVault", password);
    let vault_path = tmp.path().join("TestVault");

    // Verify directory structure
    assert!(vault_path.exists(), "vault directory should exist");
    assert!(
        vault_path.join("vault.meta").exists(),
        "vault.meta should exist"
    );
    assert!(
        vault_path.join("index.db").exists(),
        "index.db should exist"
    );
    assert!(
        vault_path.join("blobs").is_dir(),
        "blobs/ directory should exist"
    );

    // Verify vault.meta is valid
    let meta_bytes = fs::read(vault_path.join("vault.meta")).unwrap();
    assert_eq!(meta_bytes.len(), 49, "vault.meta should be 49 bytes");
    let meta = crypto::deserialize_meta(&meta_bytes).expect("vault.meta should be valid");
    assert_eq!(meta.version, 1);
    assert_eq!(meta.argon2_memory_kib, 65536);
    assert_eq!(meta.argon2_iterations, 3);
    assert_eq!(meta.argon2_parallelism, 4);

    // Lock the vault
    db::lock_db(handle.conn).expect("lock should succeed");

    // Reopen with correct password
    let _handle2 = vfs::open_vault(&vault_path, password).expect("reopen should succeed");
    db::lock_db(_handle2.conn).expect("lock should succeed");
}

// =============================================================================
// Test 2: Wrong password should fail
// =============================================================================
#[test]
fn test_wrong_password_fails() {
    let tmp = TempDir::new().unwrap();
    let password = "correct-password";
    let wrong_password = "wrong-password";

    // Create vault
    let handle = create_test_vault(tmp.path(), "SecureVault", password);
    let vault_path = tmp.path().join("SecureVault");
    db::lock_db(handle.conn).expect("lock should succeed");

    // Try to open with wrong password
    let result = vfs::open_vault(&vault_path, wrong_password);
    assert!(result.is_err(), "wrong password should fail");

    // Verify the error is InvalidPassword
    match result {
        Err(vault_app_lib::error::AppError::InvalidPassword) => {} // expected
        Err(e) => {
            // Also accept database errors related to wrong key
            let msg = format!("{}", e);
            assert!(
                msg.contains("not a database") || msg.contains("Invalid password"),
                "error should indicate wrong password, got: {}",
                msg
            );
        }
        Ok(_) => panic!("wrong password should not succeed"),
    }
}

// =============================================================================
// Test 3: Vault meta serialization roundtrip
// =============================================================================
#[test]
fn test_vault_meta_serialization() {
    let meta = crypto::VaultMeta::new_default().expect("should create meta");

    // Serialize
    let bytes = crypto::serialize_meta(&meta);
    assert_eq!(bytes.len(), 49);
    assert_eq!(&bytes[0..4], b"VLT1");
    assert_eq!(bytes[4], 1); // version

    // Deserialize
    let meta2 = crypto::deserialize_meta(&bytes).expect("should deserialize");
    assert_eq!(meta2.version, meta.version);
    assert_eq!(meta2.argon2_memory_kib, meta.argon2_memory_kib);
    assert_eq!(meta2.argon2_iterations, meta.argon2_iterations);
    assert_eq!(meta2.argon2_parallelism, meta.argon2_parallelism);
    assert_eq!(meta2.salt, meta.salt);

    // Invalid magic should fail
    let mut bad_bytes = bytes.clone();
    bad_bytes[0] = b'X';
    assert!(crypto::deserialize_meta(&bad_bytes).is_err());

    // Too short should fail
    assert!(crypto::deserialize_meta(&bytes[..10]).is_err());
}

// =============================================================================
// Test 4: Full roundtrip — ingest, lock, reopen, export, verify SHA-256
// =============================================================================
#[test]
fn test_ingest_and_export_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let password = "roundtrip-password-456";

    // Create test data
    let data_dir = create_test_data(tmp.path());

    // Collect original file hashes
    let original_hashes = collect_file_hashes(&data_dir);
    assert_eq!(original_hashes.len(), 3, "should have 3 test files");

    // Create vault and ingest the test data directory
    let handle = create_test_vault(tmp.path(), "RoundtripVault", password);
    vfs::ingest_path_recursive(&handle, &data_dir, None, false).expect("ingest should succeed");

    // Verify blobs were created
    let vault_path = tmp.path().join("RoundtripVault");
    let blob_count = fs::read_dir(vault_path.join("blobs"))
        .unwrap()
        .count();
    assert_eq!(blob_count, 3, "should have 3 blob files");

    // Get the root folder ID for export
    let root_folder_id = vfs::get_root_folder_id(&handle)
        .expect("should query root folder")
        .expect("should have a root folder");

    // Lock the vault
    db::lock_db(handle.conn).expect("lock should succeed");

    // Reopen with correct password
    let handle2 = vfs::open_vault(&vault_path, password).expect("reopen should succeed");

    // Export the ingested folder to a new location
    let export_dir = tmp.path().join("exported");
    fs::create_dir_all(&export_dir).unwrap();
    vfs::export_item(&handle2, &root_folder_id, &export_dir).expect("export should succeed");

    // The exported directory should be: export_dir/test_data/...
    let exported_data = export_dir.join("test_data");
    assert!(exported_data.exists(), "exported directory should exist");

    // Collect exported file hashes and compare
    let exported_hashes = collect_file_hashes(&exported_data);
    assert_eq!(
        exported_hashes.len(),
        original_hashes.len(),
        "exported file count should match original"
    );

    for (rel_path, original_hash) in &original_hashes {
        let exported_hash = exported_hashes
            .get(rel_path)
            .unwrap_or_else(|| panic!("exported file {:?} should exist", rel_path));
        assert_eq!(
            original_hash, exported_hash,
            "SHA-256 mismatch for {:?}",
            rel_path
        );
    }

    db::lock_db(handle2.conn).expect("final lock should succeed");
}

// =============================================================================
// Test 5: Secure deletion — blobs are zeroed and removed, DB records are gone
// =============================================================================
#[test]
fn test_delete_item_secure() {
    let tmp = TempDir::new().unwrap();
    let password = "delete-test-password";

    // Create test data and ingest
    let data_dir = create_test_data(tmp.path());
    let handle = create_test_vault(tmp.path(), "DeleteVault", password);
    vfs::ingest_path_recursive(&handle, &data_dir, None, false).expect("ingest should succeed");

    // Verify initial state
    let vault_path = tmp.path().join("DeleteVault");
    let blob_count = fs::read_dir(vault_path.join("blobs")).unwrap().count();
    assert_eq!(blob_count, 3, "should start with 3 blobs");

    let file_count: i64 = handle
        .conn
        .prepare("SELECT count(*) FROM files")
        .unwrap()
        .query_row([], |row| row.get(0))
        .unwrap();
    assert_eq!(file_count, 3, "should have 3 file records");

    let folder_count: i64 = handle
        .conn
        .prepare("SELECT count(*) FROM folders")
        .unwrap()
        .query_row([], |row| row.get(0))
        .unwrap();
    assert!(folder_count >= 2, "should have at least 2 folder records");

    // Get root folder ID and delete it
    let root_folder_id = vfs::get_root_folder_id(&handle)
        .unwrap()
        .expect("should have root folder");

    vfs::delete_item(&handle, &root_folder_id).expect("delete should succeed");

    // Verify all blobs are removed from disk
    let remaining_blobs = fs::read_dir(vault_path.join("blobs")).unwrap().count();
    assert_eq!(remaining_blobs, 0, "all blobs should be deleted");

    // Verify all DB records are gone
    let remaining_files: i64 = handle
        .conn
        .prepare("SELECT count(*) FROM files")
        .unwrap()
        .query_row([], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining_files, 0, "all file records should be deleted");

    let remaining_folders: i64 = handle
        .conn
        .prepare("SELECT count(*) FROM folders")
        .unwrap()
        .query_row([], |row| row.get(0))
        .unwrap();
    assert_eq!(remaining_folders, 0, "all folder records should be deleted");

    db::lock_db(handle.conn).expect("final lock should succeed");
}

// =============================================================================
// Test 6: Random-access HTTP 206 byte-range decryption across 4 MB chunks
// =============================================================================
#[test]
fn test_decrypt_file_range_across_chunks() {
    let tmp = TempDir::new().unwrap();
    let src_path = tmp.path().join("multi_chunk.bin");
    let enc_path = tmp.path().join("multi_chunk.dat");

    // 6.5 MB file (spans chunk 0 and chunk 1)
    let total_size: usize = 6 * 1024 * 1024 + 512 * 1024;
    let plaintext: Vec<u8> = (0..total_size)
        .map(|i| ((i.wrapping_mul(31) ^ (i >> 8)) & 0xFF) as u8)
        .collect();
    fs::write(&src_path, &plaintext).unwrap();

    let (file_key, nonce) = crypto::encrypt_file_stream(&src_path, &enc_path, false).unwrap();

    // Slice straddling the 4 MB boundary (4 MB - 1024 .. 4 MB + 2048)
    let start = (crypto::CHUNK_SIZE - 1024) as u64;
    let end = (crypto::CHUNK_SIZE + 2048 - 1) as u64;
    let slice = crypto::decrypt_file_range(
        &enc_path,
        &file_key,
        &nonce,
        total_size as u64,
        false,
        start,
        end,
    )
    .expect("range decrypt should succeed");

    assert_eq!(slice.len(), 3072);
    assert_eq!(
        &slice[..],
        &plaintext[start as usize..=end as usize],
        "decrypted byte range across chunk boundary must match original plaintext"
    );
}

// =============================================================================
// Test 7: .vault file + hidden .Name.vault-data directory resolution
// =============================================================================
#[test]
fn test_vault_file_and_hidden_data_dir_resolution() {
    use vault_app_lib::commands;

    let tmp = TempDir::new().unwrap();
    let password = "file-vault-password";

    // Simulate creating a vault via the new .vault file + hidden .vault-data dir layout
    let handle = vfs::create_vault(tmp.path(), ".Personal.vault-data", password)
        .expect("should create hidden vault data directory");
    commands::set_hidden_attribute(&handle.vault_path);

    let vault_file = tmp.path().join("Personal.vault");
    fs::copy(handle.vault_path.join("vault.meta"), &vault_file).unwrap();
    db::lock_db(handle.conn).unwrap();

    // Resolving the .vault file should return the .Personal.vault-data storage directory
    let resolved_storage = commands::resolve_vault_directory(&vault_file)
        .expect("should resolve .vault file to storage directory");
    assert_eq!(resolved_storage, tmp.path().join(".Personal.vault-data"));

    // User-facing path from storage directory should map back to Personal.vault
    let user_facing = commands::vault_user_facing_path(&resolved_storage);
    assert_eq!(user_facing, vault_file);

    // Clean display name should be "Personal"
    assert_eq!(commands::clean_vault_display_name(&resolved_storage), "Personal");
    assert_eq!(commands::clean_vault_display_name(&vault_file), "Personal");
}

// =============================================================================
// Test 8: Single-file shareable .vault roundtrip (zero companion folders)
// =============================================================================
#[test]
fn test_single_file_vault_shareable_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let password = "single-file-shareable-password";

    // Create test data (including a 5 MB multi-chunk binary file)
    let data_dir = create_test_data(tmp.path());
    let original_hashes = collect_file_hashes(&data_dir);
    assert_eq!(original_hashes.len(), 3);

    // Create single-file vault inside an isolated directory
    let vault_host_dir = tmp.path().join("vault_host");
    fs::create_dir_all(&vault_host_dir).unwrap();
    let vault_file_path = vault_host_dir.join("Shareable.vault");

    let handle = vfs::create_single_file_vault(&vault_file_path, password)
        .expect("create_single_file_vault should succeed");
    assert!(handle.is_single_file());

    // Ingest directory hierarchy (with 4 MB chunked streaming into blob_chunks table)
    vfs::ingest_path_recursive(&handle, &data_dir, None, false).expect("ingest should succeed");

    let root_folder_id = vfs::get_root_folder_id(&handle)
        .expect("should query root folder")
        .expect("should have root folder");

    // Lock the vault
    db::lock_db(handle.conn).expect("lock should succeed");

    // Verify ONLY the single Shareable.vault file exists in vault_host_dir (no companion folders, no -wal/-shm)
    let host_entries: Vec<_> = fs::read_dir(&vault_host_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(
        host_entries,
        vec!["Shareable.vault".to_string()],
        "vault_host_dir should contain ONLY Shareable.vault"
    );

    // Simulate sharing ONLY the single .vault file over the web to another folder/machine
    let downloaded_dir = tmp.path().join("downloaded_from_web");
    fs::create_dir_all(&downloaded_dir).unwrap();
    let downloaded_vault_file = downloaded_dir.join("Shareable.vault");
    fs::copy(&vault_file_path, &downloaded_vault_file).unwrap();

    // Verify wrong password fails on the single .vault file
    assert!(
        vfs::open_single_file_vault(&downloaded_vault_file, "wrong-password").is_err(),
        "wrong password must fail on single-file .vault"
    );

    // Reopen the copied single .vault file with the correct password
    let handle2 = vfs::open_single_file_vault(&downloaded_vault_file, password)
        .expect("reopen of copied single-file .vault should succeed");

    // Export the entire folder tree from the single-file .vault and verify SHA-256 hashes
    let export_dir = tmp.path().join("exported_single_file");
    fs::create_dir_all(&export_dir).unwrap();
    vfs::export_item(&handle2, &root_folder_id, &export_dir).expect("export should succeed");

    let exported_hashes = collect_file_hashes(&export_dir.join("test_data"));
    assert_eq!(exported_hashes.len(), original_hashes.len());
    for (rel_path, orig_hash) in &original_hashes {
        assert_eq!(
            orig_hash,
            exported_hashes.get(rel_path).unwrap(),
            "SHA-256 mismatch for {:?} in single-file .vault",
            rel_path
        );
    }

    db::lock_db(handle2.conn).expect("final lock should succeed");
}

// =============================================================================
// Test 9: Pre-flight disk space validation rejects impossible size & reports bytes
// =============================================================================
#[test]
fn test_disk_space_validation_rejects_impossible_size() {
    let tmp = TempDir::new().unwrap();

    // Available space on the temp drive must be positive
    let available = vfs::get_available_disk_space(tmp.path())
        .expect("get_available_disk_space should succeed");
    assert!(available > 0, "available disk space must be > 0");

    // Small check (e.g. 1 KiB) should succeed
    vfs::check_disk_space_for_bytes(tmp.path(), 1024, true)
        .expect("1 KiB disk space check should pass");

    // Impossible request (u64::MAX / 2 bytes) must fail with InsufficientDiskSpace
    let err = vfs::check_disk_space_for_bytes(tmp.path(), u64::MAX / 2, true)
        .expect_err("impossible disk space request must fail");

    match err {
        vault_app_lib::error::AppError::InsufficientDiskSpace {
            required_bytes,
            available_bytes,
        } => {
            assert!(required_bytes > available_bytes);
            let msg = format!(
                "{}",
                vault_app_lib::error::AppError::InsufficientDiskSpace {
                    required_bytes,
                    available_bytes,
                }
            );
            assert!(
                msg.contains("Insufficient disk space"),
                "error string should start with Insufficient disk space: {}",
                msg
            );
        }
        other => panic!("expected InsufficientDiskSpace, got {:?}", other),
    }
}

// =============================================================================
// Test 10: Resilient ingest skips missing/deleted/antivirus-blocked files and continues
// =============================================================================
#[test]
fn test_resilient_ingest_skips_missing_file_and_continues() {
    let tmp = TempDir::new().unwrap();
    let password = "resilient-import-password";

    let vault_file = tmp.path().join("Resilient.vault");
    let handle = vfs::create_single_file_vault(&vault_file, password)
        .expect("create_single_file_vault should succeed");

    let file1 = tmp.path().join("valid_before.txt");
    let missing_file = tmp.path().join("quarantined_by_av.exe");
    let file2 = tmp.path().join("valid_after.txt");

    fs::write(&file1, b"File 1 content before skipped item").unwrap();
    fs::write(&file2, b"File 2 content after skipped item").unwrap();

    let mut report = vfs::IngestReport::default();

    handle.conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    for path in [&file1, &missing_file, &file2] {
        vfs::ingest_path_resilient(
            &handle,
            path,
            None,
            false,
            &mut report,
            &mut |_, _, _| {},
        )
        .expect("resilient ingest must not abort on missing/quarantined file");
    }
    handle.conn.execute_batch("COMMIT;").unwrap();

    assert_eq!(report.imported_files, 2, "both valid files must be imported");
    assert_eq!(report.skipped_files.len(), 1, "missing file must be recorded as skipped");
    assert_eq!(report.skipped_files[0].name, "quarantined_by_av.exe");

    let db_file_count: i64 = handle
        .conn
        .prepare("SELECT count(*) FROM files")
        .unwrap()
        .query_row([], |row| row.get(0))
        .unwrap();
    assert_eq!(db_file_count, 2, "vault database must contain the 2 valid files");

    db::lock_db(handle.conn).expect("lock should succeed");
}

// =============================================================================
// Test 11: Transparent Zstandard (Zstd) chunk compression, seek, and export
// =============================================================================
#[test]
fn test_zstd_compressed_vault_roundtrip_and_range_seek() {
    let tmp = TempDir::new().unwrap();
    let password = "zstd-test-password-123";

    let vault_file = tmp.path().join("Compressed.vault");
    let handle = vfs::create_single_file_vault(&vault_file, password)
        .expect("create_single_file_vault should succeed");

    // Create an 8 MB highly compressible file (repeating log text patterns)
    let src_file = tmp.path().join("server_logs.txt");
    let pattern = b"[2026-10-21 00:00:01] INFO  com.app.worker - Processing batch transaction id=998822 status=OK\n";
    let repeat_count = (8 * 1024 * 1024) / pattern.len() + 1;
    let mut raw_data = Vec::with_capacity(repeat_count * pattern.len());
    for _ in 0..repeat_count {
        raw_data.extend_from_slice(pattern);
    }
    fs::write(&src_file, &raw_data).unwrap();
    let expected_hash = sha256_file(&src_file);

    // Ingest with compress = true
    let mut report = vfs::IngestReport::default();
    vfs::ingest_path_resilient(
        &handle,
        &src_file,
        None,
        true,
        &mut report,
        &mut |_, _, _| {},
    )
    .expect("compressed ingest should succeed");

    assert_eq!(report.imported_files, 1);

    // Verify compressed flag is set in the database
    let (file_id, blob_id, size_bytes, is_compressed, file_key_bytes, file_nonce_bytes): (
        String,
        String,
        i64,
        i64,
        Vec<u8>,
        Vec<u8>,
    ) = handle
        .conn
        .query_row(
            "SELECT id, blob_id, size_bytes, compressed, file_key, file_nonce FROM files WHERE original_name = 'server_logs.txt'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .expect("file row should exist");

    assert_eq!(is_compressed, 1, "compressed column must be 1");
    assert_eq!(size_bytes, raw_data.len() as i64);

    // Verify database chunk data is drastically smaller than 8 MB (Zstd level 3 on repeating text compresses > 95%)
    let total_stored_chunk_bytes: i64 = handle
        .conn
        .query_row(
            "SELECT COALESCE(SUM(length(data)), 0) FROM blob_chunks WHERE blob_id = ?1",
            rusqlite::params![blob_id],
            |r| r.get(0),
        )
        .unwrap();

    assert!(
        total_stored_chunk_bytes < 500 * 1024,
        "Stored compressed chunks ({} bytes) should be significantly smaller than raw 8 MB data",
        total_stored_chunk_bytes
    );

    // Test byte-range seek into chunk 1 across the 4 MB boundary
    let file_key: [u8; 32] = file_key_bytes.try_into().unwrap();
    let file_nonce: [u8; 7] = file_nonce_bytes.try_into().unwrap();
    let start_offset = (crypto::CHUNK_SIZE - 256) as u64;
    let end_offset = (crypto::CHUNK_SIZE + 512) as u64;

    let range_data = crypto::decrypt_file_range_from_db(
        &handle.conn,
        &blob_id,
        &file_key,
        &file_nonce,
        raw_data.len() as u64,
        true,
        start_offset,
        end_offset,
    )
    .expect("range seek on compressed file must succeed");

    assert_eq!(
        range_data.len(),
        (end_offset - start_offset + 1) as usize
    );
    assert_eq!(
        &range_data[..],
        &raw_data[start_offset as usize..=end_offset as usize],
        "Decompressed range seek slice must match raw source slice exactly"
    );

    // Test full export and hash verification
    let export_dir = tmp.path().join("exported");
    fs::create_dir_all(&export_dir).unwrap();
    vfs::export_item(&handle, &file_id, &export_dir).expect("export should succeed");

    let exported_file = export_dir.join("server_logs.txt");
    assert!(exported_file.is_file());
    let exported_hash = sha256_file(&exported_file);
    assert_eq!(
        exported_hash, expected_hash,
        "Exported decompressed file hash must match original"
    );

    db::lock_db(handle.conn).expect("lock should succeed");
}

#[test]
fn test_batch_deletion_atomic() {
    let tmp = TempDir::new().unwrap();
    let data_dir = create_test_data(tmp.path());
    let vault_dir = tmp.path().join("BatchDelVault");

    let handle = create_test_vault(&vault_dir, "BatchDelVault", "P@ssword123!");

    vfs::ingest_path_recursive(&handle, &data_dir, None, false)
        .expect("ingest should succeed");

    // Verify files exist in database
    let count: i64 = handle
        .conn
        .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 3);

    let folder_count: i64 = handle
        .conn
        .query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0))
        .unwrap();
    assert_eq!(folder_count, 3);

    // Collect all top-level folder IDs
    let mut top_folder_id: String = String::new();
    handle
        .conn
        .query_row(
            "SELECT id FROM folders WHERE parent_id IS NULL",
            [],
            |r| {
                top_folder_id = r.get(0)?;
                Ok(())
            },
        )
        .unwrap();

    let items_to_delete = vec![top_folder_id];

    // Run batch deletion
    vfs::delete_items_batch(&handle, &items_to_delete, &mut |_, _, _| {})
        .expect("batch deletion should succeed");

    // Verify all files and folders are atomically gone
    let count_after: i64 = handle
        .conn
        .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count_after, 0, "All files must be deleted");

    let folder_count_after: i64 = handle
        .conn
        .query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0))
        .unwrap();
    assert_eq!(folder_count_after, 0, "All folders must be deleted");

    db::lock_db(handle.conn).expect("lock should succeed");
}

#[test]
fn test_retroactive_compression_toggle() {
    let tmp = TempDir::new().unwrap();
    let vault_dir = tmp.path().join("CompressionMigrationVault.vault");

    let handle = create_test_vault(&vault_dir, "CompressionMigrationVault", "SecurePass123!");

    // Initially compression setting is false
    let initial_setting = db::get_vault_compression_setting(&handle.conn).unwrap();
    assert!(!initial_setting, "Default compression setting should be false");

    // Ingest a repeating compressible text file uncompressed
    let raw_text = "ANTIGRAVITY_TEST_COMPRESSION_LINE\n".repeat(5000);
    let raw_data = raw_text.into_bytes();
    let file_path = tmp.path().join("compressible.txt");
    fs::write(&file_path, &raw_data).unwrap();
    let expected_hash = sha256_file(&file_path);

    let mut report = vfs::IngestReport::default();
    vfs::ingest_file_resilient(
        &handle,
        &file_path,
        raw_data.len() as u64,
        None,
        false, // uncompressed initially
        &mut report,
        &mut |_, _, _| {},
    )
    .expect("ingest should succeed");

    let (file_id, is_compressed_init): (String, i64) = handle
        .conn
        .query_row(
            "SELECT id, compressed FROM files WHERE original_name = 'compressible.txt'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(is_compressed_init, 0, "Should be initially uncompressed");

    // Toggle vault compression ON retroactively
    vfs::reprocess_vault_compression(&handle, true, &mut |_, _, _, _, _| {})
        .expect("reprocess compression enable should succeed");

    let setting_after = db::get_vault_compression_setting(&handle.conn).unwrap();
    assert!(setting_after, "Setting must now be true");

    let is_compressed_now: i64 = handle
        .conn
        .query_row(
            "SELECT compressed FROM files WHERE id = ?1",
            rusqlite::params![file_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(is_compressed_now, 1, "File must now be marked compressed");

    // Verify exported file matches hash after compression
    let export_dir = tmp.path().join("export_compressed");
    fs::create_dir_all(&export_dir).unwrap();
    vfs::export_item(&handle, &file_id, &export_dir).expect("export should succeed");
    let exported_file = export_dir.join("compressible.txt");
    assert_eq!(sha256_file(&exported_file), expected_hash);

    // Toggle vault compression back OFF retroactively
    vfs::reprocess_vault_compression(&handle, false, &mut |_, _, _, _, _| {})
        .expect("reprocess compression disable should succeed");

    let setting_final = db::get_vault_compression_setting(&handle.conn).unwrap();
    assert!(!setting_final, "Setting must now be false");

    let is_compressed_final: i64 = handle
        .conn
        .query_row(
            "SELECT compressed FROM files WHERE id = ?1",
            rusqlite::params![file_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(is_compressed_final, 0, "File must now be marked uncompressed");

    // Verify exported file matches hash after decompression
    let export_dir_decomp = tmp.path().join("export_decompressed");
    fs::create_dir_all(&export_dir_decomp).unwrap();
    vfs::export_item(&handle, &file_id, &export_dir_decomp).expect("export should succeed");
    let exported_file_decomp = export_dir_decomp.join("compressible.txt");
    assert_eq!(sha256_file(&exported_file_decomp), expected_hash);

    db::lock_db(handle.conn).expect("lock should succeed");
}


