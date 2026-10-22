// db.rs — SQLCipher database initialization, schema management, and clean locking.
//
// AGENTS.md compliance:
// - Real SQLCipher with bundled-sqlcipher-vendored-openssl
// - PRAGMA key with hex-encoded master key on every connection
// - PRAGMA wal_checkpoint(TRUNCATE) before closing
// - Incremental vacuuming & comprehensive indexing for sub-5ms queries
// - No .unwrap() / .expect() — all operations return AppResult

use std::path::Path;

use rusqlite::Connection;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

/// Configure hardened SQLite performance, safety, and memory pragmas.
///
/// Ensures low-spec PC resilience, sub-millisecond query responses, and clean locking:
/// - WAL journal mode for concurrent reading/writing without locks
/// - NORMAL synchronous mode (safe with WAL, significantly faster on HDDs/SSDs)
/// - In-memory temporary tables & sorting buffers
/// - 16 MiB cache size (-16000 KiB) for fast lookups without RAM bloat
/// - Foreign keys enabled and 5000ms busy timeout to prevent transient locked-table errors
/// - Incremental auto-vacuum to avoid full-database page rewrites on deletions
pub fn configure_pragmas(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -16000;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        PRAGMA auto_vacuum = INCREMENTAL;
        ",
    )?;
    Ok(())
}

/// Open a SQLCipher-encrypted database and verify the key is correct.
///
/// The master_key is a raw 32-byte key, which is hex-encoded for SQLCipher's `PRAGMA key`.
/// After setting the key, we verify the database is accessible by querying `sqlite_master`.
pub fn open_db(db_path: &Path, master_key: &[u8; 32]) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;

    // Set the encryption key using hex notation: PRAGMA key = "x'<hex>'";
    // Key string is wrapped in Zeroizing so memory is scrubbed on drop.
    let hex_key = Zeroizing::new(format!("x'{}'", hex::encode(master_key)));
    conn.pragma_update(None, "key", hex_key.as_str())?;

    // Verify the key is correct by querying sqlite_master.
    // If the key is wrong, this will fail with "file is not a database".
    let result: Result<i64, _> = conn
        .prepare("SELECT count(*) FROM sqlite_master")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)));

    match result {
        Ok(_) => {
            configure_pragmas(&conn)?;
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

/// Create and initialize a single-file `.vault` SQLCipher database with an explicit 16-byte salt
/// stored in bytes `0..16` of the database file.
pub fn create_single_file_db(
    db_path: &Path,
    master_key: &[u8; 32],
    salt16: &[u8; 16],
) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;

    // SQLCipher raw key + explicit 16-byte salt syntax: x'<64-hex-key><32-hex-salt>' (96 hex chars)
    let hex_key_and_salt = Zeroizing::new(format!(
        "x'{}{}'",
        hex::encode(master_key),
        hex::encode(salt16)
    ));
    conn.pragma_update(None, "key", hex_key_and_salt.as_str())?;
    configure_pragmas(&conn)?;

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

    let hex_key_and_salt = Zeroizing::new(format!(
        "x'{}{}'",
        hex::encode(master_key),
        hex::encode(salt16)
    ));
    conn.pragma_update(None, "key", hex_key_and_salt.as_str())?;

    let result: Result<i64, _> = conn
        .prepare("SELECT count(*) FROM sqlite_master")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get(0)));

    match result {
        Ok(_) => {
            configure_pragmas(&conn)?;
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

/// Create the vault schema (folders, files, blob_chunks, and vault_settings tables) if it doesn't already exist.
pub fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
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

        CREATE TABLE IF NOT EXISTS vault_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_files_blob_id ON files(blob_id);
        CREATE INDEX IF NOT EXISTS idx_files_original_name ON files(original_name);
        ",
    )?;

    // Backward-compatible schema migrations for existing vaults
    let _ = conn.execute(
        "ALTER TABLE files ADD COLUMN compressed INTEGER NOT NULL DEFAULT 0",
        [],
    );

    Ok(())
}

/// Retrieve the persistent vault-wide compression setting. Defaults to false if unset.
pub fn get_vault_compression_setting(conn: &Connection) -> AppResult<bool> {
    let res = conn.query_row(
        "SELECT value FROM vault_settings WHERE key = 'is_compressed'",
        [],
        |row| row.get::<_, String>(0),
    );

    match res {
        Ok(v) => Ok(v == "1" || v.eq_ignore_ascii_case("true")),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Persist the vault-wide compression setting.
pub fn set_vault_compression_setting(conn: &Connection, compressed: bool) -> AppResult<()> {
    conn.execute(
        "INSERT INTO vault_settings (key, value) VALUES ('is_compressed', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![if compressed { "1" } else { "0" }],
    )?;
    Ok(())
}

/// Safely lock a vault database by checkpointing WAL and closing the connection.
///
/// This ensures the vault file/folder can be safely copied to external media (e.g., USB drive)
/// without WAL corruption.
pub fn lock_db(conn: Connection) -> AppResult<()> {
    conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")?;
    drop(conn);
    Ok(())
}
