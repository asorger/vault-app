// db.rs — SQLCipher database initialization, schema management, and clean locking.
//
// AGENTS.md compliance:
// - Real SQLCipher with bundled-sqlcipher-vendored-openssl
// - PRAGMA key with hex-encoded master key on every connection
// - PRAGMA wal_checkpoint(TRUNCATE) before closing
// - No .unwrap() / .expect() — all operations return AppResult

use std::path::Path;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Open a SQLCipher-encrypted database and verify the key is correct.
///
/// The master_key is a raw 32-byte key, which is hex-encoded for SQLCipher's `PRAGMA key`.
/// After setting the key, we verify the database is accessible by querying `sqlite_master`.
pub fn open_db(db_path: &Path, master_key: &[u8; 32]) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;

    // Set the encryption key using hex notation: PRAGMA key = "x'<hex>'";
    let hex_key = format!("x'{}'", hex::encode(master_key));
    conn.pragma_update(None, "key", &hex_key)?;

    // Verify the key is correct by querying sqlite_master.
    // If the key is wrong, this will fail with "file is not a database".
    let result: Result<i64, _> = conn
        .prepare("SELECT count(*) FROM sqlite_master")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)));

    match result {
        Ok(_) => Ok(conn),
        Err(e) => {
            // Check if this is a "not a database" error (wrong key)
            let msg = e.to_string();
            if msg.contains("not a database") || msg.contains("file is encrypted") {
                Err(AppError::InvalidPassword)
            } else {
                Err(AppError::Database(e))
            }
        }
    }
}

/// Create and initialize a single-file `.vault` SQLCipher database with an explicit 16-byte salt
/// stored in bytes `0..16` of the database file.
pub fn create_single_file_db(
    db_path: &Path,
    master_key: &[u8; 32],
    salt16: &[u8; 16],
) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;

    // SQLCipher raw key + explicit 16-byte salt syntax: x'<64-hex-key><32-hex-salt>' (96 hex chars)
    let hex_key_and_salt = format!("x'{}{}'", hex::encode(master_key), hex::encode(salt16));
    conn.pragma_update(None, "key", &hex_key_and_salt)?;
    conn.pragma_update(None, "auto_vacuum", "INCREMENTAL")?;

    create_schema(&conn)?;
    let _ = conn.pragma_update(None, "wal_checkpoint", "TRUNCATE");

    Ok(conn)
}

/// Open an existing single-file `.vault` SQLCipher database using the 32-byte Argon2id master key
/// and the 16-byte file header salt.
pub fn open_single_file_db(
    db_path: &Path,
    master_key: &[u8; 32],
    salt16: &[u8; 16],
) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;

    let hex_key_and_salt = format!("x'{}{}'", hex::encode(master_key), hex::encode(salt16));
    conn.pragma_update(None, "key", &hex_key_and_salt)?;

    let result: Result<i64, _> = conn
        .prepare("SELECT count(*) FROM sqlite_master")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)));

    match result {
        Ok(_) => {
            // Ensure blob_chunks table exists if schema was upgraded
            create_schema(&conn)?;
            Ok(conn)
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("not a database") || msg.contains("file is encrypted") {
                Err(AppError::InvalidPassword)
            } else {
                Err(AppError::Database(e))
            }
        }
    }
}

/// Create the vault schema (folders, files, and blob_chunks tables) if it doesn't already exist.
pub fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE IF NOT EXISTS folders (
            id          TEXT PRIMARY KEY,
            parent_id   TEXT,
            name        TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id)
        );

        CREATE TABLE IF NOT EXISTS files (
            id            TEXT PRIMARY KEY,
            folder_id     TEXT,
            blob_id       TEXT NOT NULL,
            original_name TEXT NOT NULL,
            size_bytes    INTEGER NOT NULL,
            mime_type     TEXT NOT NULL,
            file_key      BLOB NOT NULL,
            file_nonce    BLOB NOT NULL,
            created_at    TEXT NOT NULL,
            compressed    INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (folder_id) REFERENCES folders(id)
        );

        CREATE TABLE IF NOT EXISTS blob_chunks (
            blob_id     TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            data        BLOB NOT NULL,
            PRIMARY KEY (blob_id, chunk_index)
        );

        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_files_blob_id ON files(blob_id);
        ",
    )?;

    // Backward-compatible schema migration for existing vaults
    let _ = conn.execute(
        "ALTER TABLE files ADD COLUMN compressed INTEGER NOT NULL DEFAULT 0",
        [],
    );

    Ok(())
}

/// Safely lock a vault database by checkpointing WAL and closing the connection.
///
/// This ensures the vault folder can be safely copied to external media (e.g., USB drive)
/// without WAL corruption.
pub fn lock_db(conn: Connection) -> AppResult<()> {
    conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")?;
    // Explicitly drop the connection to close it
    drop(conn);
    Ok(())
}

