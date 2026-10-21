// commands.rs — Tauri v2 IPC command implementations and multi-vault state management.
//
// AGENTS.md compliance:
// - Thread-safe multi-vault state management
// - Never log or expose plaintext keys, passwords, or file keys to frontend
// - Return structured Result<T, AppError> for all commands
// - Clean locking with WAL checkpoint
// - Real-time progress event emission

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::crypto;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::vfs::{self, VaultHandle};

/// Embedded 32x32 PNG icon used as drag preview image when dragging files out to OS.
const DRAG_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");

/// Tracks whether a native Win32 outbound file drag (`start_os_drag_export`) is currently in progress.
static IS_OUTBOUND_DRAGGING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Thread-safe global application state holding active vault sessions.
#[derive(Clone)]
pub struct AppState {
    /// Legacy single-session slot kept for backward compatibility with integration tests.
    pub session: Arc<Mutex<Option<VaultHandle>>>,
    /// Multi-vault session map keyed by vault ID, where each vault has its own independent lock.
    pub sessions: Arc<Mutex<HashMap<String, Arc<Mutex<VaultHandle>>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Obtain a cloned Arc to the per-vault Mutex<VaultHandle>.
    pub fn get_vault_arc(&self, vault_id: Option<&str>) -> AppResult<Arc<Mutex<VaultHandle>>> {
        let sessions_guard = self
            .sessions
            .lock()
            .map_err(|_| AppError::VaultFormat("Failed to acquire vault session lock".into()))?;

        if let Some(id) = vault_id {
            if let Some(arc) = sessions_guard.get(id) {
                return Ok(arc.clone());
            }
        } else if let Some(arc) = sessions_guard.values().next() {
            return Ok(arc.clone());
        }

        Err(AppError::VaultFormat("No vault is currently open".into()))
    }

    /// Execute a closure with a reference to the requested vault handle.
    /// Acquires the global sessions map lock only briefly to clone the per-vault `Arc<Mutex<VaultHandle>>`.
    pub fn with_vault<F, R>(&self, vault_id: Option<&str>, f: F) -> AppResult<R>
    where
        F: FnOnce(&VaultHandle) -> AppResult<R>,
    {
        let vault_arc_opt = {
            let sessions_guard = self
                .sessions
                .lock()
                .map_err(|_| AppError::VaultFormat("Failed to acquire vault session lock".into()))?;

            if let Some(id) = vault_id {
                sessions_guard.get(id).cloned()
            } else {
                sessions_guard.values().next().cloned()
            }
        };

        if let Some(vault_arc) = vault_arc_opt {
            let handle_guard = vault_arc
                .lock()
                .map_err(|_| AppError::VaultFormat("Failed to acquire vault handle lock".into()))?;
            return f(&handle_guard);
        }

        let single_guard = self
            .session
            .lock()
            .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
        if let Some(ref handle) = *single_guard {
            return f(handle);
        }

        Err(AppError::VaultFormat("No vault is currently open".into()))
    }

    /// Run a blocking vault operation on Tauri's background threadpool so the UI thread never freezes.
    pub async fn run_blocking<F, R>(&self, vault_id: Option<String>, f: F) -> AppResult<R>
    where
        F: FnOnce(&VaultHandle) -> AppResult<R> + Send + 'static,
        R: Send + 'static,
    {
        let state_clone = self.clone();
        tauri::async_runtime::spawn_blocking(move || {
            state_clone.with_vault(vault_id.as_deref(), f)
        })
        .await
        .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Information returned upon creating or opening a vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub id: String,
    pub name: String,
    pub vault_path: String,
}

/// Virtual folder record returned to the frontend, including recursive size and file count.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub size_bytes: i64,
    pub file_count: i64,
    pub created_at: String,
}

/// Virtual file record returned to the frontend (omits encryption keys/nonces for memory hygiene).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualFile {
    pub id: String,
    pub folder_id: Option<String>,
    pub blob_id: String,
    pub original_name: String,
    pub size_bytes: i64,
    pub mime_type: String,
    pub created_at: String,
    pub compressed: bool,
}

/// Navigation breadcrumb item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreadcrumbItem {
    pub id: Option<String>,
    pub name: String,
}

/// Result of listing a virtual directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub current_folder_id: Option<String>,
    pub folders: Vec<VirtualFolder>,
    pub files: Vec<VirtualFile>,
    pub breadcrumbs: Vec<BreadcrumbItem>,
}

/// Identifier passed when modifying, moving, or deleting an item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemIdentifier {
    pub id: String,
    pub is_folder: bool,
}

/// Search results container.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub query: String,
    pub folders: Vec<VirtualFolder>,
    pub files: Vec<VirtualFile>,
}

/// Progress payload emitted via `"vault://transfer-progress"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub phase: String, // "ingest" or "export"
    pub current_item: String,
    pub items_completed: usize,
    pub total_items: usize,
    pub bytes_processed: u64,
    pub total_bytes: u64,
}

// =============================================================================
// Helpers
// =============================================================================

/// Clean display name for a vault path (strips leading `.`, `.vault-data`, and `.vault` suffix).
pub fn clean_vault_display_name(path: &Path) -> String {
    let raw = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Vault");

    let without_data = if let Some(stripped) = raw
        .strip_suffix(".vault-data")
        .or_else(|| raw.strip_suffix(".VAULT-DATA"))
    {
        stripped.strip_prefix('.').unwrap_or(stripped)
    } else {
        raw
    };

    without_data
        .strip_suffix(".vault")
        .or_else(|| without_data.strip_suffix(".VAULT"))
        .unwrap_or(without_data)
        .to_string()
}

/// Set the Windows `FILE_ATTRIBUTE_HIDDEN` flag on the companion `.vault-data` directory
/// so only the `<Name>.vault` file is shown in Windows Explorer.
pub fn set_hidden_attribute(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, INVALID_FILE_ATTRIBUTES,
        };
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let attrs = GetFileAttributesW(wide.as_ptr());
            if attrs != INVALID_FILE_ATTRIBUTES {
                let _ = SetFileAttributesW(wide.as_ptr(), attrs | FILE_ATTRIBUTE_HIDDEN);
            } else {
                let _ = SetFileAttributesW(wide.as_ptr(), FILE_ATTRIBUTE_HIDDEN);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
    }
}

/// Return the user-facing `.vault` file path for a given vault path.
pub fn vault_user_facing_path(storage_path: &Path) -> PathBuf {
    if storage_path.is_file() {
        return storage_path.to_path_buf();
    }
    if let (Some(parent), Some(dir_name)) = (
        storage_path.parent(),
        storage_path.file_name().and_then(|n| n.to_str()),
    ) {
        if let Some(base) = dir_name
            .strip_suffix(".vault-data")
            .or_else(|| dir_name.strip_suffix(".VAULT-DATA"))
        {
            let clean = base.strip_prefix('.').unwrap_or(base);
            let vault_file = parent.join(format!("{}.vault", clean));
            if vault_file.is_file() {
                return vault_file;
            }
        }
    }
    storage_path.to_path_buf()
}

/// Resolve an input path (a single-file `<Name>.vault` archive, a legacy `.Name.vault-data` directory,
/// or a legacy `<Name>.vault/` directory) to the underlying vault path.
pub fn resolve_vault_directory(input_path: &Path) -> Option<PathBuf> {
    if input_path.is_dir() && input_path.join("vault.meta").is_file() {
        return Some(input_path.to_path_buf());
    }
    if input_path.is_file() {
        if let (Some(parent), Some(file_name)) = (
            input_path.parent(),
            input_path.file_name().and_then(|n| n.to_str()),
        ) {
            if let Some(clean) = file_name
                .strip_suffix(".vault")
                .or_else(|| file_name.strip_suffix(".VAULT"))
            {
                let hidden_dir = parent.join(format!(".{}.vault-data", clean));
                if hidden_dir.is_dir() && hidden_dir.join("vault.meta").is_file() {
                    return Some(hidden_dir);
                }
                let plain_data_dir = parent.join(format!("{}.vault-data", clean));
                if plain_data_dir.is_dir() && plain_data_dir.join("vault.meta").is_file() {
                    return Some(plain_data_dir);
                }
                // Single-file `.vault` archive
                return Some(input_path.to_path_buf());
            }
            // Legacy support: file inside a vault folder (such as `open.vault` or `vault.meta`)
            if parent.join("vault.meta").is_file() && parent.join("index.db").is_file() {
                return Some(parent.to_path_buf());
            }
        }
    }
    None
}

/// Compute recursive total size in bytes and total file count for a virtual folder.
fn compute_folder_stats(conn: &rusqlite::Connection, folder_id: &str) -> (i64, i64) {
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
    conn.query_row(sql, rusqlite::params![folder_id], |row| {
        Ok((
            row.get::<_, i64>(0).unwrap_or(0),
            row.get::<_, i64>(1).unwrap_or(0),
        ))
    })
    .unwrap_or((0, 0))
}

/// Return the temporary staging directory used during outbound OS drag operations.
fn staging_base_dir(vault_path: &Path) -> PathBuf {
    if vault_path.is_dir() {
        vault_path.join(".staging")
    } else {
        std::env::temp_dir().join("vault-app-staging")
    }
}

/// Securely zero-overwrite and remove any temporary drag-export staging folder.
pub fn cleanup_staging_dir(vault_path: &Path) {
    let staging = staging_base_dir(vault_path);
    if staging.is_dir() {
        let mut files = Vec::new();
        let mut dirs = Vec::new();
        for entry in walkdir::WalkDir::new(&staging)
            .contents_first(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                files.push(entry.into_path());
            } else if entry.file_type().is_dir() {
                dirs.push(entry.into_path());
            }
        }
        for f in files {
            let _ = vfs::zero_overwrite(&f);
        }
        for d in dirs {
            let _ = std::fs::remove_dir(d);
        }
    }
}

/// Register per-user `.vault` file association in `HKCU\Software\Classes` on Windows.
/// Does not require administrator privileges and works for portable builds.
pub fn register_vault_file_association() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if let Ok(exe_path) = std::env::current_exe() {
            let exe_str = exe_path.to_string_lossy();
            let cmd_val = format!("\"{}\" \"%1\"", exe_str);
            let icon_val = format!("\"{}\",0", exe_str);

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Classes\.vault",
                    "/ve",
                    "/d",
                    "VaultApp.Document",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Classes\VaultApp.Document",
                    "/ve",
                    "/d",
                    "Encrypted Vault",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Classes\VaultApp.Document\DefaultIcon",
                    "/ve",
                    "/d",
                    &icon_val,
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Classes\VaultApp.Document\shell\open\command",
                    "/ve",
                    "/d",
                    &cmd_val,
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
    }
}

// =============================================================================
// Commands
// =============================================================================

/// Query the OS hardware keyboard state to check if the `Shift` key is currently held down.
/// Works even when Windows Explorer owns focus during an external OS file drag.
#[tauri::command]
pub fn is_shift_key_pressed() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_SHIFT};
        (GetAsyncKeyState(VK_SHIFT as i32) as u16 & 0x8000) != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Check whether an outbound OS file drag from this app is currently in progress.
#[tauri::command]
pub fn is_outbound_dragging() -> bool {
    IS_OUTBOUND_DRAGGING.load(std::sync::atomic::Ordering::SeqCst)
}

/// Check if the application was launched with a `.vault` path in CLI arguments.
#[tauri::command]
pub fn get_startup_vault_path() -> Option<String> {
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let path = Path::new(&arg);
        if let Some(resolved) = resolve_vault_directory(path) {
            let user_facing = vault_user_facing_path(&resolved);
            return Some(user_facing.to_string_lossy().to_string());
        }
    }
    None
}

/// Check if an arbitrary OS path is a `.vault` file or vault directory.
#[tauri::command]
pub fn check_is_vault_path(path: String) -> Option<String> {
    resolve_vault_directory(Path::new(&path)).map(|p| {
        vault_user_facing_path(&p)
            .to_string_lossy()
            .to_string()
    })
}

/// Helper to safely close an `Arc<Mutex<VaultHandle>>`.
pub fn close_vault_arc(vault_arc: Arc<Mutex<VaultHandle>>) -> AppResult<()> {
    match Arc::try_unwrap(vault_arc) {
        Ok(mutex) => {
            if let Ok(handle) = mutex.into_inner() {
                cleanup_staging_dir(&handle.vault_path);
                db::lock_db(handle.conn)?;
            }
        }
        Err(arc) => {
            if let Ok(handle_guard) = arc.lock() {
                cleanup_staging_dir(&handle_guard.vault_path);
                let _ = handle_guard.conn.pragma_update(None, "wal_checkpoint", "TRUNCATE");
            }
        }
    }
    Ok(())
}

/// Create a new vault instance as a single self-contained `<Name>.vault` file
/// and add it to active sessions.
#[tauri::command]
pub async fn create_vault_instance(
    parent_dir: String,
    name: String,
    password: String,
    state: State<'_, AppState>,
) -> AppResult<VaultInfo> {
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let parent = Path::new(&parent_dir);
        if !parent.is_dir() {
            return Err(AppError::VaultFormat(
                "Parent directory does not exist or is not a directory".into(),
            ));
        }

        vfs::check_disk_space_for_bytes(parent, 0, false)?;

        let trimmed = name.trim();
        let clean_name = trimmed
            .strip_suffix(".vault")
            .or_else(|| trimmed.strip_suffix(".VAULT"))
            .unwrap_or(trimmed)
            .to_string();

        if clean_name.is_empty() {
            return Err(AppError::VaultFormat("Vault name cannot be empty".into()));
        }

        let vault_file_path = parent.join(format!("{}.vault", clean_name));
        if vault_file_path.exists() {
            return Err(AppError::VaultFormat(format!(
                "Vault '{}' already exists at this location",
                vault_file_path.display()
            )));
        }

        let handle = vfs::create_single_file_vault(&vault_file_path, &password)?;

        let user_facing_path = vault_file_path.to_string_lossy().to_string();
        let id = uuid::Uuid::new_v4().to_string();

        let mut sessions = state_clone
            .sessions
            .lock()
            .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
        sessions.insert(id.clone(), Arc::new(Mutex::new(handle)));

        Ok(VaultInfo {
            id,
            name: clean_name,
            vault_path: user_facing_path,
        })
    })
    .await
    .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
}

/// Open an existing vault instance (from a single-file `.vault` archive or legacy vault directory)
/// and add it to active sessions.
#[tauri::command]
pub async fn open_vault_instance(
    vault_dir: String,
    password: String,
    state: State<'_, AppState>,
) -> AppResult<VaultInfo> {
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let raw_path = Path::new(&vault_dir);
        let path = resolve_vault_directory(raw_path).unwrap_or_else(|| raw_path.to_path_buf());

        if !path.is_file() && !path.is_dir() {
            return Err(AppError::VaultFormat(
                "Vault file does not exist or could not be found".into(),
            ));
        }

        let canonical_target = path.canonicalize().unwrap_or_else(|_| path.clone());

        // Check if this vault is already mounted in an active tab
        {
            let sessions = state_clone
                .sessions
                .lock()
                .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;

            for (existing_id, existing_arc) in sessions.iter() {
                if let Ok(existing_handle) = existing_arc.lock() {
                    let existing_canon = existing_handle
                        .vault_path
                        .canonicalize()
                        .unwrap_or_else(|_| existing_handle.vault_path.clone());
                    if existing_canon == canonical_target {
                        let user_facing = vault_user_facing_path(&existing_handle.vault_path)
                            .to_string_lossy()
                            .to_string();
                        return Ok(VaultInfo {
                            id: existing_id.clone(),
                            name: clean_vault_display_name(&existing_handle.vault_path),
                            vault_path: user_facing,
                        });
                    }
                }
            }
        }

        let handle = if path.is_file() {
            vfs::open_single_file_vault(&path, &password)?
        } else {
            vfs::open_vault(&path, &password)?
        };

        // Legacy support: if opened from a `.vault-data` directory, keep it hidden
        if handle.vault_path.is_dir() {
            if let Some(dir_name) = handle.vault_path.file_name().and_then(|n| n.to_str()) {
                if dir_name.ends_with(".vault-data") || dir_name.ends_with(".VAULT-DATA") {
                    set_hidden_attribute(&handle.vault_path);
                    if let Some(parent) = handle.vault_path.parent() {
                        let clean = clean_vault_display_name(&handle.vault_path);
                        let top_file = parent.join(format!("{}.vault", clean));
                        if !top_file.exists() {
                            let _ = std::fs::copy(handle.vault_path.join("vault.meta"), &top_file);
                        }
                    }
                }
            }
        }

        let name = clean_vault_display_name(&handle.vault_path);
        let vault_path = vault_user_facing_path(&handle.vault_path)
            .to_string_lossy()
            .to_string();
        let id = uuid::Uuid::new_v4().to_string();

        let mut sessions = state_clone
            .sessions
            .lock()
            .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
        sessions.insert(id.clone(), Arc::new(Mutex::new(handle)));

        Ok(VaultInfo {
            id,
            name,
            vault_path,
        })
    })
    .await
    .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
}

/// Safely lock/close a specific vault session (or all sessions if `vault_id` is None).
#[tauri::command]
pub async fn lock_vault_instance(
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(id) = vault_id {
            let removed = {
                let mut sessions = state_clone
                    .sessions
                    .lock()
                    .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
                sessions.remove(&id)
            };
            if let Some(vault_arc) = removed {
                close_vault_arc(vault_arc)?;
            }
        } else {
            let drained: Vec<Arc<Mutex<VaultHandle>>> = {
                let mut sessions = state_clone
                    .sessions
                    .lock()
                    .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
                sessions.drain().map(|(_, v)| v).collect()
            };
            for vault_arc in drained {
                let _ = close_vault_arc(vault_arc);
            }
            if let Ok(mut single) = state_clone.session.lock() {
                if let Some(handle) = single.take() {
                    cleanup_staging_dir(&handle.vault_path);
                    let _ = db::lock_db(handle.conn);
                }
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
}

/// List files and folders inside a given virtual folder (or root if None), including breadcrumbs and recursive folder sizes.
#[tauri::command]
pub async fn list_directory(
    folder_id: Option<String>,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<DirectoryListing> {
    state
        .run_blocking(vault_id, move |handle| {
            // Query folders
            let mut folders = Vec::new();
            match &folder_id {
                Some(fid) => {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, parent_id, name, created_at FROM folders WHERE parent_id = ?1 ORDER BY name COLLATE NOCASE ASC",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![fid], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    })?;
                    for r in rows {
                        let (id, parent_id, name, created_at) = r?;
                        let (size_bytes, file_count) = compute_folder_stats(&handle.conn, &id);
                        folders.push(VirtualFolder {
                            id,
                            parent_id,
                            name,
                            size_bytes,
                            file_count,
                            created_at,
                        });
                    }
                }
                None => {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, parent_id, name, created_at FROM folders WHERE parent_id IS NULL ORDER BY name COLLATE NOCASE ASC",
                    )?;
                    let rows = stmt.query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    })?;
                    for r in rows {
                        let (id, parent_id, name, created_at) = r?;
                        let (size_bytes, file_count) = compute_folder_stats(&handle.conn, &id);
                        folders.push(VirtualFolder {
                            id,
                            parent_id,
                            name,
                            size_bytes,
                            file_count,
                            created_at,
                        });
                    }
                }
            }

            // Query files
            let mut files = Vec::new();
            match &folder_id {
                Some(fid) => {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, folder_id, blob_id, original_name, size_bytes, mime_type, created_at, COALESCE(compressed, 0)
                         FROM files WHERE folder_id = ?1 ORDER BY original_name COLLATE NOCASE ASC",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![fid], |row| {
                        Ok(VirtualFile {
                            id: row.get(0)?,
                            folder_id: row.get(1)?,
                            blob_id: row.get(2)?,
                            original_name: row.get(3)?,
                            size_bytes: row.get(4)?,
                            mime_type: row.get(5)?,
                            created_at: row.get(6)?,
                            compressed: row.get::<_, i64>(7)? != 0,
                        })
                    })?;
                    for f in rows {
                        files.push(f?);
                    }
                }
                None => {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, folder_id, blob_id, original_name, size_bytes, mime_type, created_at, COALESCE(compressed, 0)
                         FROM files WHERE folder_id IS NULL ORDER BY original_name COLLATE NOCASE ASC",
                    )?;
                    let rows = stmt.query_map([], |row| {
                        Ok(VirtualFile {
                            id: row.get(0)?,
                            folder_id: row.get(1)?,
                            blob_id: row.get(2)?,
                            original_name: row.get(3)?,
                            size_bytes: row.get(4)?,
                            mime_type: row.get(5)?,
                            created_at: row.get(6)?,
                            compressed: row.get::<_, i64>(7)? != 0,
                        })
                    })?;
                    for f in rows {
                        files.push(f?);
                    }
                }
            }

            // Compute breadcrumbs starting with the Vault Name itself
            let vault_root_name = clean_vault_display_name(&handle.vault_path);
            let mut breadcrumbs = vec![BreadcrumbItem {
                id: None,
                name: vault_root_name,
            }];

            if let Some(ref current_id) = folder_id {
                let mut path_nodes = Vec::new();
                let mut curr = Some(current_id.clone());

                while let Some(cid) = curr {
                    let mut stmt = handle
                        .conn
                        .prepare("SELECT id, parent_id, name FROM folders WHERE id = ?1")?;
                    let res: Option<(String, Option<String>, String)> = stmt
                        .query_row(rusqlite::params![cid], |row| {
                            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                        })
                        .ok();

                    if let Some((id, parent, name)) = res {
                        path_nodes.push(BreadcrumbItem {
                            id: Some(id),
                            name,
                        });
                        curr = parent;
                    } else {
                        break;
                    }
                }

                path_nodes.reverse();
                breadcrumbs.extend(path_nodes);
            }

            Ok(DirectoryListing {
                current_folder_id: folder_id,
                folders,
                files,
                breadcrumbs,
            })
        })
        .await
}

/// Create a new virtual folder inside the specified vault.
#[tauri::command]
pub async fn create_virtual_folder(
    parent_id: Option<String>,
    name: String,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<VirtualFolder> {
    state
        .run_blocking(vault_id, move |handle| {
            let id = uuid::Uuid::new_v4().to_string();
            let created_at = vfs::now_iso8601();

            handle.conn.execute(
                "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, parent_id, name, created_at],
            )?;

            Ok(VirtualFolder {
                id,
                parent_id,
                name,
                size_bytes: 0,
                file_count: 0,
                created_at,
            })
        })
        .await
}

/// Rename a virtual item (folder or file).
#[tauri::command]
pub async fn rename_virtual_item(
    id: String,
    is_folder: bool,
    new_name: String,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state
        .run_blocking(vault_id, move |handle| {
            if is_folder {
                handle.conn.execute(
                    "UPDATE folders SET name = ?1 WHERE id = ?2",
                    rusqlite::params![new_name, id],
                )?;
            } else {
                handle.conn.execute(
                    "UPDATE files SET original_name = ?1 WHERE id = ?2",
                    rusqlite::params![new_name, id],
                )?;
            }
            Ok(())
        })
        .await
}

/// Move virtual items (files or folders) into a target virtual folder (or root if `target_folder_id` is None).
#[tauri::command]
pub async fn move_virtual_items(
    items: Vec<ItemIdentifier>,
    target_folder_id: Option<String>,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state
        .run_blocking(vault_id, move |handle| {
            let _ = handle.conn.execute_batch("BEGIN IMMEDIATE;");
            let res: AppResult<()> = (|| {
                for item in items {
                    if item.is_folder {
                        // Prevent moving a folder into itself or one of its own descendants
                        if let Some(ref target_id) = target_folder_id {
                            if target_id == &item.id {
                                continue;
                            }
                            let is_descendant: bool = handle
                                .conn
                                .query_row(
                                    "WITH RECURSIVE descendants(id) AS (
                                        SELECT ?1
                                        UNION ALL
                                        SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
                                    )
                                    SELECT COUNT(*) > 0 FROM descendants WHERE id = ?2",
                                    rusqlite::params![item.id, target_id],
                                    |row| row.get(0),
                                )
                                .unwrap_or(false);
                            if is_descendant {
                                return Err(AppError::VaultFormat(
                                    "Cannot move a folder into itself or its own subfolder".into(),
                                ));
                            }
                        }

                        handle.conn.execute(
                            "UPDATE folders SET parent_id = ?1 WHERE id = ?2",
                            rusqlite::params![target_folder_id, item.id],
                        )?;
                    } else {
                        handle.conn.execute(
                            "UPDATE files SET folder_id = ?1 WHERE id = ?2",
                            rusqlite::params![target_folder_id, item.id],
                        )?;
                    }
                }
                Ok(())
            })();

            match res {
                Ok(()) => {
                    let _ = handle.conn.execute_batch("COMMIT;");
                    Ok(())
                }
                Err(e) => {
                    let _ = handle.conn.execute_batch("ROLLBACK;");
                    Err(e)
                }
            }
        })
        .await
}

/// Delete multiple virtual items (files or folders) securely on a background thread with real-time progress.
#[tauri::command]
pub async fn delete_virtual_items(
    items: Vec<ItemIdentifier>,
    vault_id: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    if items.is_empty() {
        return Ok(());
    }

    let vault_arc = state.get_vault_arc(vault_id.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let (total_bytes, total_files) = {
            let handle = vault_arc
                .lock()
                .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
            let item_ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
            vfs::compute_items_size_and_count(&handle.conn, &item_ids)
        };
        let total_items = total_files.max(items.len());

        let _ = app_handle.emit(
            "vault://transfer-progress",
            TransferProgressPayload {
                phase: "delete".into(),
                current_item: "Preparing deletion...".into(),
                items_completed: 0,
                total_items,
                bytes_processed: 0,
                total_bytes,
            },
        );

        let mut items_completed = 0usize;
        let mut bytes_processed = 0u64;
        let mut last_emit = Instant::now();

        for item in &items {
            let mut item_name = String::new();
            let mut item_bytes = 0u64;
            let mut item_files = 0usize;

            {
                let handle = vault_arc
                    .lock()
                    .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
                let _ = handle.conn.execute_batch("BEGIN IMMEDIATE;");
                let del_res = vfs::delete_item_with_progress(
                    &handle,
                    &item.id,
                    &mut |bytes_delta, files_delta, name| {
                        item_name = name.to_string();
                        item_bytes = item_bytes.saturating_add(bytes_delta);
                        item_files = item_files.saturating_add(files_delta);
                    },
                );

                match del_res {
                    Ok(_) => {
                        let _ = handle.conn.execute_batch("COMMIT;");
                    }
                    Err(e) => {
                        let _ = handle.conn.execute_batch("ROLLBACK;");
                        return Err(e);
                    }
                }
            } // Lock released here between items so directory listing and explorer update live

            bytes_processed = bytes_processed.saturating_add(item_bytes);
            items_completed = items_completed.saturating_add(item_files.max(1));

            if last_emit.elapsed() >= Duration::from_millis(30) || items_completed >= total_items {
                last_emit = Instant::now();
                let _ = app_handle.emit(
                    "vault://transfer-progress",
                    TransferProgressPayload {
                        phase: "delete".into(),
                        current_item: if item_name.is_empty() {
                            "Deleted item".into()
                        } else {
                            item_name
                        },
                        items_completed: items_completed.min(total_items),
                        total_items,
                        bytes_processed: bytes_processed.min(total_bytes),
                        total_bytes,
                    },
                );
            }
            std::thread::yield_now();
        }

        let _ = app_handle.emit(
            "vault://transfer-progress",
            TransferProgressPayload {
                phase: "delete".into(),
                current_item: "Deletion complete".into(),
                items_completed: total_items,
                total_items,
                bytes_processed: total_bytes,
                total_bytes,
            },
        );

        Ok(())
    })
    .await
    .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
}

/// Ingest OS files and folders into the active vault on a background thread,
/// validating free disk space beforehand, skipping unreadable/antivirus-blocked files
/// without halting the batch, and emitting real-time chunk & file progress events.
#[tauri::command]
pub async fn ingest_os_paths(
    paths: Vec<String>,
    target_folder_id: Option<String>,
    shred_originals: bool,
    compress: Option<bool>,
    vault_id: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<vfs::IngestReport> {
    let should_compress = compress.unwrap_or(false);
    let vault_arc = state.get_vault_arc(vault_id.as_deref())?;

    tauri::async_runtime::spawn_blocking(move || {
        let (canonical_vault, canonical_staging, vault_path_for_check) = {
            let handle = vault_arc
                .lock()
                .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
            let cv = handle
                .vault_path
                .canonicalize()
                .unwrap_or_else(|_| handle.vault_path.clone());
            let sb = staging_base_dir(&handle.vault_path);
            let cs = sb.canonicalize().unwrap_or_else(|_| sb.clone());
            (cv, cs, handle.vault_path.clone())
        };

        // Filter out any paths that are the vault itself or inside our staging directory
        let mut valid_paths = Vec::new();
        for p in &paths {
            let canon = Path::new(p)
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(p));
            if canon.starts_with(&canonical_vault) || canon.starts_with(&canonical_staging) {
                if shred_originals {
                    return Err(AppError::VaultFormat(
                        "Safety check violation: Cannot shred paths inside the vault or staging directory"
                            .into(),
                    ));
                }
                continue;
            }
            valid_paths.push(p.clone());
        }

        if valid_paths.is_empty() {
            return Ok(vfs::IngestReport::default());
        }

        // Pre-scan to calculate total items and total bytes
        let mut total_items = 0usize;
        let mut total_bytes = 0u64;

        for p in &valid_paths {
            let p_path = Path::new(p);
            if p_path.is_file() {
                total_items += 1;
                total_bytes += std::fs::metadata(p_path).map(|m| m.len()).unwrap_or(0);
            } else if p_path.is_dir() {
                for entry in walkdir::WalkDir::new(p_path)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        total_items += 1;
                        total_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    }
                }
            }
        }

        // Pre-flight disk space validation on the volume hosting the vault
        vfs::check_disk_space_for_bytes(&vault_path_for_check, total_bytes, true)?;

        let effective_total_items = total_items.max(1);
        let _ = app_handle.emit(
            "vault://transfer-progress",
            TransferProgressPayload {
                phase: "ingest".into(),
                current_item: "Starting import...".into(),
                items_completed: 0,
                total_items: effective_total_items,
                bytes_processed: 0,
                total_bytes,
            },
        );

        let mut items_completed = 0usize;
        let mut bytes_processed = 0u64;
        let mut last_emit = Instant::now();
        let mut report = vfs::IngestReport::default();

        let emit_progress = |app: &AppHandle,
                             last_e: &mut Instant,
                             cur_item: &str,
                             bytes_proc: u64,
                             items_comp: usize,
                             force: bool| {
            if force || last_e.elapsed() >= Duration::from_millis(30) || items_comp >= effective_total_items {
                *last_e = Instant::now();
                let _ = app.emit(
                    "vault://transfer-progress",
                    TransferProgressPayload {
                        phase: "ingest".into(),
                        current_item: cur_item.to_string(),
                        items_completed: items_comp.min(effective_total_items),
                        total_items: effective_total_items,
                        bytes_processed: bytes_proc.min(total_bytes),
                        total_bytes,
                    },
                );
            }
        };

        for p in &valid_paths {
            let p_path = Path::new(p);
            if p_path.is_file() {
                let meta_len = std::fs::metadata(p_path).map(|m| m.len()).unwrap_or(0);
                let fname = p_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file")
                    .to_string();

                {
                    let handle = vault_arc
                        .lock()
                        .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
                    let mut file_bytes_emitted = 0u64;
                    vfs::ingest_file_resilient(
                        &handle,
                        p_path,
                        meta_len,
                        target_folder_id.as_deref(),
                        should_compress,
                        &mut report,
                        &mut |chunk_bytes, files_delta, _| {
                            file_bytes_emitted = file_bytes_emitted.saturating_add(chunk_bytes);
                            bytes_processed = bytes_processed.saturating_add(chunk_bytes);
                            items_completed = items_completed.saturating_add(files_delta);
                        },
                    )?;
                } // Lock released after this file is committed!

                emit_progress(
                    &app_handle,
                    &mut last_emit,
                    &fname,
                    bytes_processed,
                    items_completed,
                    true,
                );
                std::thread::yield_now();
            } else if p_path.is_dir() {
                let root_folder_id = {
                    let handle = vault_arc
                        .lock()
                        .map_err(|_| AppError::VaultFormat("Failed to acquire vault lock".into()))?;
                    let fid = uuid::Uuid::new_v4().to_string();
                    let name = p_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("folder");
                    let created_at = vfs::now_iso8601();
                    handle.conn.execute(
                        "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                        rusqlite::params![fid, target_folder_id.as_deref(), name, created_at],
                    )?;
                    fid
                };

                let mut folder_map: HashMap<PathBuf, String> = HashMap::new();
                folder_map.insert(p_path.to_path_buf(), root_folder_id);

                for entry in walkdir::WalkDir::new(p_path)
                    .min_depth(1)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let ep = entry.path();
                    let parent_os = ep.parent().unwrap_or(p_path);
                    let parent_fid = folder_map.get(parent_os).cloned();

                    if entry.file_type().is_dir() {
                        let fid = {
                            let handle = vault_arc.lock().map_err(|_| {
                                AppError::VaultFormat("Failed to acquire vault lock".into())
                            })?;
                            let id = uuid::Uuid::new_v4().to_string();
                            let name = ep
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("folder");
                            let created_at = vfs::now_iso8601();
                            handle.conn.execute(
                                "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                                rusqlite::params![id, parent_fid.as_deref(), name, created_at],
                            )?;
                            id
                        };
                        folder_map.insert(ep.to_path_buf(), fid);
                    } else if entry.file_type().is_file() {
                        let meta_len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let fname = ep
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("file")
                            .to_string();

                        {
                            let handle = vault_arc.lock().map_err(|_| {
                                AppError::VaultFormat("Failed to acquire vault lock".into())
                            })?;
                            vfs::ingest_file_resilient(
                                &handle,
                                ep,
                                meta_len,
                                parent_fid.as_deref(),
                                should_compress,
                                &mut report,
                                &mut |chunk_bytes, files_delta, _| {
                                    bytes_processed = bytes_processed.saturating_add(chunk_bytes);
                                    items_completed = items_completed.saturating_add(files_delta);
                                },
                            )?;
                        } // Lock released after each nested file is committed!

                        emit_progress(
                            &app_handle,
                            &mut last_emit,
                            &fname,
                            bytes_processed,
                            items_completed,
                            true,
                        );
                        std::thread::yield_now();
                    }
                }
            }
        }

        // Always emit final completion event so the TransferQueueDrawer never gets stuck spinning
        let _ = app_handle.emit(
            "vault://transfer-progress",
            TransferProgressPayload {
                phase: "ingest".into(),
                current_item: "Import complete".into(),
                items_completed: effective_total_items,
                total_items: effective_total_items,
                bytes_processed: total_bytes,
                total_bytes,
            },
        );

        // Securely shred ONLY original files that were successfully encrypted and committed
        if shred_originals {
            for f in &report.succeeded_os_files {
                if f.exists() && f.is_file() {
                    let _ = vfs::zero_overwrite(f);
                }
            }
            for p in &valid_paths {
                let p_path = Path::new(p);
                if p_path.exists() && p_path.is_dir() {
                    let mut dirs_to_remove = Vec::new();
                    for entry in walkdir::WalkDir::new(p_path)
                        .contents_first(true)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if entry.file_type().is_dir() {
                            dirs_to_remove.push(entry.into_path());
                        }
                    }
                    for d in dirs_to_remove {
                        // remove_dir only removes empty directories, preserving any folder with a skipped file
                        let _ = std::fs::remove_dir(d);
                    }
                }
            }
        }

        Ok(report)
    })
    .await
    .map_err(|e| AppError::VaultFormat(format!("Background task error: {}", e)))?
}

/// Export virtual items (files or folders) to a destination OS directory on a background thread,
/// validating free disk space beforehand and emitting real-time chunk & file progress events.
#[tauri::command]
pub async fn export_virtual_items(
    items: Vec<ItemIdentifier>,
    destination_dir: String,
    vault_id: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state
        .run_blocking(vault_id, move |handle| {
            let dest = Path::new(&destination_dir);
            if !dest.is_dir() {
                return Err(AppError::VaultFormat(
                    "Destination directory does not exist".into(),
                ));
            }

            if items.is_empty() {
                return Ok(());
            }

            let item_ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
            let (total_bytes, total_files) =
                vfs::compute_items_size_and_count(&handle.conn, &item_ids);

            // Pre-flight disk space validation on the destination drive
            vfs::check_disk_space_for_bytes(dest, total_bytes, false)?;

            let total_items = total_files.max(items.len());
            let _ = app_handle.emit(
                "vault://transfer-progress",
                TransferProgressPayload {
                    phase: "export".into(),
                    current_item: "Starting export...".into(),
                    items_completed: 0,
                    total_items,
                    bytes_processed: 0,
                    total_bytes,
                },
            );

            let mut items_completed = 0usize;
            let mut bytes_processed = 0u64;
            let mut last_emit = Instant::now();

            for item in &items {
                vfs::export_item_with_progress(
                    handle,
                    &item.id,
                    dest,
                    &mut |bytes_delta, files_delta, name| {
                        bytes_processed = bytes_processed.saturating_add(bytes_delta);
                        items_completed = items_completed.saturating_add(files_delta);
                        if last_emit.elapsed() >= Duration::from_millis(40)
                            || items_completed >= total_items
                        {
                            last_emit = Instant::now();
                            let _ = app_handle.emit(
                                "vault://transfer-progress",
                                TransferProgressPayload {
                                    phase: "export".into(),
                                    current_item: name.to_string(),
                                    items_completed: items_completed.min(total_items),
                                    total_items,
                                    bytes_processed: bytes_processed.min(total_bytes),
                                    total_bytes,
                                },
                            );
                        }
                    },
                )?;
            }

            let _ = app_handle.emit(
                "vault://transfer-progress",
                TransferProgressPayload {
                    phase: "export".into(),
                    current_item: "Export complete".into(),
                    items_completed: total_items,
                    total_items,
                    bytes_processed: total_bytes,
                    total_bytes,
                },
            );

            Ok(())
        })
        .await
}

/// Start a native OS drag-out operation so the user can drag files out of the vault
/// and drop them directly into Windows Explorer, Desktop, or external applications.
#[tauri::command]
pub async fn start_os_drag_export(
    items: Vec<ItemIdentifier>,
    vault_id: Option<String>,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> AppResult<()> {
    if items.is_empty() {
        return Ok(());
    }

    let (exported_paths, batch_dir) = state
        .run_blocking(vault_id, move |handle| {
            let staging_root = staging_base_dir(&handle.vault_path);
            let item_ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
            let (total_bytes, _) = vfs::compute_items_size_and_count(&handle.conn, &item_ids);

            // Validate free disk space on the staging drive before exporting
            vfs::check_disk_space_for_bytes(&staging_root, total_bytes, false)?;

            let batch_dir = staging_root.join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&batch_dir)?;

            for item in &items {
                vfs::export_item(handle, &item.id, &batch_dir)?;
            }

            let mut paths = Vec::new();
            for entry in std::fs::read_dir(&batch_dir)?.filter_map(|e| e.ok()) {
                let p = entry.path();
                let canon = p.canonicalize().unwrap_or(p);
                paths.push(canon);
            }

            Ok((paths, batch_dir))
        })
        .await?;

    if exported_paths.is_empty() {
        let _ = std::fs::remove_dir_all(&batch_dir);
        return Ok(());
    }

    IS_OUTBOUND_DRAGGING.store(true, std::sync::atomic::Ordering::SeqCst);

    let win_clone = window.clone();
    let _ = window.run_on_main_thread(move || {
        let drag_item = drag::DragItem::Files(exported_paths);
        let preview_icon = drag::Image::Raw(DRAG_ICON_PNG.to_vec());
        let opts = drag::Options {
            skip_animatation_on_cancel_or_failure: true,
            mode: drag::DragMode::Copy,
        };

        let _ = drag::start_drag(
            &win_clone,
            drag_item,
            preview_icon,
            move |_result, _pos| {
                IS_OUTBOUND_DRAGGING.store(false, std::sync::atomic::Ordering::SeqCst);
                let cleanup_dir = batch_dir.clone();
                // Securely zero-overwrite staging files on a background thread after drag finishes
                std::thread::spawn(move || {
                    if cleanup_dir.exists() {
                        let mut files = Vec::new();
                        let mut dirs = Vec::new();
                        for entry in walkdir::WalkDir::new(&cleanup_dir)
                            .contents_first(true)
                            .into_iter()
                            .filter_map(|e| e.ok())
                        {
                            if entry.file_type().is_file() {
                                files.push(entry.into_path());
                            } else if entry.file_type().is_dir() {
                                dirs.push(entry.into_path());
                            }
                        }
                        for f in files {
                            let _ = vfs::zero_overwrite(&f);
                        }
                        for d in dirs {
                            let _ = std::fs::remove_dir(d);
                        }
                    }
                });
            },
            opts,
        );
    });

    Ok(())
}

/// Stream-decrypt the first `max_bytes` of a file as UTF-8 text for in-app code/text/markdown previewing.
#[tauri::command]
pub async fn read_file_text_preview(
    file_id: String,
    max_bytes: Option<usize>,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    state
        .run_blocking(vault_id, move |handle| {
            let row: (String, i64, Vec<u8>, Vec<u8>, i64) = handle
                .conn
                .query_row(
                    "SELECT blob_id, size_bytes, file_key, file_nonce, COALESCE(compressed, 0) FROM files WHERE id = ?1",
                    rusqlite::params![file_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .map_err(|_| AppError::NotFound(format!("File not found: {}", file_id)))?;

            let (blob_id, size_bytes, key_bytes, nonce_bytes, compressed) = row;
            if size_bytes <= 0 {
                return Ok(String::new());
            }

            let file_key: zeroize::Zeroizing<[u8; 32]> = key_bytes
                .try_into()
                .map(zeroize::Zeroizing::new)
                .map_err(|_| AppError::Crypto("Invalid file key".into()))?;
            let file_nonce: [u8; 7] = nonce_bytes
                .try_into()
                .map_err(|_| AppError::Crypto("Invalid file nonce".into()))?;

            let cap = max_bytes.unwrap_or(512 * 1024) as u64;
            let total = size_bytes as u64;
            let end = total.min(cap).saturating_sub(1);
            let is_compressed = compressed != 0;

            let bytes = if handle.is_single_file() {
                crypto::decrypt_file_range_from_db(
                    &handle.conn,
                    &blob_id,
                    &file_key,
                    &file_nonce,
                    total,
                    is_compressed,
                    0,
                    end,
                )?
            } else {
                let blob_path = handle
                    .vault_path
                    .join("blobs")
                    .join(format!("{}.dat", blob_id));
                crypto::decrypt_file_range(&blob_path, &file_key, &file_nonce, total, is_compressed, 0, end)?
            };

            Ok(String::from_utf8_lossy(&bytes).into_owned())
        })
        .await
}

/// Search for folders and files inside the active vault (or recursively inside `folder_id` if provided)
/// matching a query string.
#[tauri::command]
pub async fn search_vault(
    query: String,
    folder_id: Option<String>,
    vault_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<SearchResults> {
    state
        .run_blocking(vault_id, move |handle| {
            let mut folders = Vec::new();
            let mut files = Vec::new();

            if let Some(ref root_fid) = folder_id {
                // Search recursively inside `root_fid` and all of its nested subfolders
                {
                    let mut stmt = handle.conn.prepare(
                        "WITH RECURSIVE descendants(id) AS (
                            SELECT id FROM folders WHERE parent_id = ?1
                            UNION ALL
                            SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
                        )
                        SELECT id, parent_id, name, created_at FROM folders
                        WHERE id IN (SELECT id FROM descendants)
                          AND name LIKE '%' || ?2 || '%'
                        ORDER BY name COLLATE NOCASE ASC LIMIT 250",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![root_fid, query], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    })?;
                    for r in rows {
                        let (id, parent_id, name, created_at) = r?;
                        let (size_bytes, file_count) = compute_folder_stats(&handle.conn, &id);
                        folders.push(VirtualFolder {
                            id,
                            parent_id,
                            name,
                            size_bytes,
                            file_count,
                            created_at,
                        });
                    }
                }

                {
                    let mut stmt = handle.conn.prepare(
                        "WITH RECURSIVE descendants(id) AS (
                            SELECT ?1
                            UNION ALL
                            SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
                        )
                        SELECT id, folder_id, blob_id, original_name, size_bytes, mime_type, created_at, COALESCE(compressed, 0)
                        FROM files
                        WHERE folder_id IN (SELECT id FROM descendants)
                          AND original_name LIKE '%' || ?2 || '%'
                        ORDER BY original_name COLLATE NOCASE ASC LIMIT 250",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![root_fid, query], |row| {
                        Ok(VirtualFile {
                            id: row.get(0)?,
                            folder_id: row.get(1)?,
                            blob_id: row.get(2)?,
                            original_name: row.get(3)?,
                            size_bytes: row.get(4)?,
                            mime_type: row.get(5)?,
                            created_at: row.get(6)?,
                            compressed: row.get::<_, i64>(7)? != 0,
                        })
                    })?;
                    for f in rows {
                        files.push(f?);
                    }
                }
            } else {
                // Search across the entire vault
                {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, parent_id, name, created_at FROM folders
                         WHERE name LIKE '%' || ?1 || '%' ORDER BY name COLLATE NOCASE ASC LIMIT 250",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![query], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    })?;
                    for r in rows {
                        let (id, parent_id, name, created_at) = r?;
                        let (size_bytes, file_count) = compute_folder_stats(&handle.conn, &id);
                        folders.push(VirtualFolder {
                            id,
                            parent_id,
                            name,
                            size_bytes,
                            file_count,
                            created_at,
                        });
                    }
                }

                {
                    let mut stmt = handle.conn.prepare(
                        "SELECT id, folder_id, blob_id, original_name, size_bytes, mime_type, created_at, COALESCE(compressed, 0)
                         FROM files WHERE original_name LIKE '%' || ?1 || '%' ORDER BY original_name COLLATE NOCASE ASC LIMIT 250",
                    )?;
                    let rows = stmt.query_map(rusqlite::params![query], |row| {
                        Ok(VirtualFile {
                            id: row.get(0)?,
                            folder_id: row.get(1)?,
                            blob_id: row.get(2)?,
                            original_name: row.get(3)?,
                            size_bytes: row.get(4)?,
                            mime_type: row.get(5)?,
                            created_at: row.get(6)?,
                            compressed: row.get::<_, i64>(7)? != 0,
                        })
                    })?;
                    for f in rows {
                        files.push(f?);
                    }
                }
            }

            Ok(SearchResults {
                query,
                folders,
                files,
            })
        })
        .await
}
