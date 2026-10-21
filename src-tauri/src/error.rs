use thiserror::Error;

/// Structured application error type.
/// Serialized to the frontend as a plain string message.
/// Never exposes internal keys, passwords, or sensitive paths.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Cryptography error: {0}")]
    Crypto(String),

    #[error("Vault format error: {0}")]
    VaultFormat(String),

    #[error("Invalid password")]
    InvalidPassword,

    #[error("Item not found: {0}")]
    NotFound(String),

    #[error("Insufficient disk space: requires {}, but only {} is available on the target drive (required_bytes={}, available_bytes={})", format_bytes_human(*.required_bytes), format_bytes_human(*.available_bytes), .required_bytes, .available_bytes)]
    InsufficientDiskSpace {
        required_bytes: u64,
        available_bytes: u64,
    },
}

pub fn format_bytes_human(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    const TB: f64 = GB * 1024.0;
    let b = bytes as f64;
    if b >= TB {
        format!("{:.2} TB", b / TB)
    } else if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.1} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

