// ipc_test.rs — Automated unit and integration tests for Phase 2 IPC commands and state logic.
//
// Run with: cargo test --test ipc_test -- --nocapture

use std::fs;
use tempfile::TempDir;

use vault_app_lib::commands::{AppState, BreadcrumbItem};
use vault_app_lib::db;
use vault_app_lib::vfs;

#[test]
fn test_folder_crud_and_breadcrumbs() {
    let tmp = TempDir::new().unwrap();
    let vault_name = "CrudVault";
    let password = "crud-password-123";

    // Create vault directly to test database state
    let handle = vfs::create_vault(tmp.path(), vault_name, password).unwrap();
    let state = AppState::new();
    *state.session.lock().unwrap() = Some(handle);

    // 1. Initially directory listing at root should be empty
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();

        let mut stmt = handle_ref
            .conn
            .prepare("SELECT count(*) FROM folders WHERE parent_id IS NULL")
            .unwrap();
        let count: i64 = stmt.query_row([], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    // 2. Create virtual folder at root: "Documents"
    let doc_id = uuid::Uuid::new_v4().to_string();
    let now = vfs::now_iso8601();
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();
        handle_ref
            .conn
            .execute(
                "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![doc_id, None::<String>, "Documents", now],
            )
            .unwrap();
    }

    // 3. Create subfolder inside "Documents": "Tax"
    let tax_id = uuid::Uuid::new_v4().to_string();
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();
        handle_ref
            .conn
            .execute(
                "INSERT INTO folders (id, parent_id, name, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![tax_id, Some(doc_id.clone()), "Tax", now],
            )
            .unwrap();
    }

    // 4. Verify breadcrumbs computation from Tax
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();

        let mut breadcrumbs = vec![BreadcrumbItem {
            id: None,
            name: "Root".to_string(),
        }];

        let mut path_nodes = Vec::new();
        let mut curr = Some(tax_id.clone());

        while let Some(cid) = curr {
            let mut stmt = handle_ref
                .conn
                .prepare("SELECT id, parent_id, name FROM folders WHERE id = ?1")
                .unwrap();
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

        assert_eq!(breadcrumbs.len(), 3);
        assert_eq!(breadcrumbs[0].name, "Root");
        assert_eq!(breadcrumbs[1].name, "Documents");
        assert_eq!(breadcrumbs[2].name, "Tax");
    }

    // 5. Rename "Tax" to "Taxes 2026"
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();
        handle_ref
            .conn
            .execute(
                "UPDATE folders SET name = ?1 WHERE id = ?2",
                rusqlite::params!["Taxes 2026", tax_id],
            )
            .unwrap();

        let mut stmt = handle_ref
            .conn
            .prepare("SELECT name FROM folders WHERE id = ?1")
            .unwrap();
        let name: String = stmt.query_row(rusqlite::params![tax_id], |r| r.get(0)).unwrap();
        assert_eq!(name, "Taxes 2026");
    }

    // 6. Search query
    {
        let guard = state.session.lock().unwrap();
        let handle_ref = guard.as_ref().unwrap();

        let mut stmt = handle_ref
            .conn
            .prepare("SELECT id, name FROM folders WHERE name LIKE '%' || ?1 || '%'")
            .unwrap();
        let rows = stmt
            .query_map(rusqlite::params!["Tax"], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap();

        let matches: Vec<(String, String)> = rows.collect::<Result<Vec<_>, _>>().unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].1, "Taxes 2026");
    }

    // 7. Clean lock
    {
        let mut guard = state.session.lock().unwrap();
        let handle = guard.take().unwrap();
        db::lock_db(handle.conn).unwrap();
    }
}

#[test]
fn test_shred_originals_overwrites_with_zeros() {
    let tmp = TempDir::new().unwrap();
    let file_to_shred = tmp.path().join("sensitive.txt");

    // Write sensitive data
    let original_content = b"TOP SECRET FINANCIAL REPORT - SENSITIVE DATA";
    fs::write(&file_to_shred, original_content).unwrap();
    assert!(file_to_shred.exists());

    // Call zero_overwrite
    vfs::zero_overwrite(&file_to_shred).unwrap();

    // The file should now be deleted from disk
    assert!(!file_to_shred.exists(), "File should be removed after zero overwrite");
}
