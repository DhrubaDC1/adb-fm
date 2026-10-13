use droidbridge_lib::adb::command::AdbCommandRunner;
use droidbridge_lib::adb::device::{DeviceService, DeviceStatus};
use droidbridge_lib::db::history::{HistoryDb, TransferHistoryItem};
use droidbridge_lib::diagnostics::logger::DiagnosticLogger;
use droidbridge_lib::fs::local::LocalFsService;
use droidbridge_lib::fs::remote::RemoteFsService;
use droidbridge_lib::settings::config::SettingsStore;
use tempfile::NamedTempFile;

#[test]
fn test_safe_shell_arg_escaping() {
    assert_eq!(AdbCommandRunner::escape_shell_arg(""), "''");
    assert_eq!(AdbCommandRunner::escape_shell_arg("simple"), "'simple'");
    assert_eq!(
        AdbCommandRunner::escape_shell_arg("filename with spaces.mp4"),
        "'filename with spaces.mp4'"
    );
    assert_eq!(
        AdbCommandRunner::escape_shell_arg("O'Reilly Book.pdf"),
        "'O'\\''Reilly Book.pdf'"
    );
    // Malicious shell injection characters must be neutrally wrapped
    assert_eq!(
        AdbCommandRunner::escape_shell_arg("test; rm -rf /; echo 'hi'"),
        "'test; rm -rf /; echo '\\''hi'\\'''"
    );
}

#[test]
fn test_device_status_and_listing_parsing() {
    let mock_output = r#"List of devices attached
emulator-5554          device product:sdk_gphone64 model:Pixel_7 device:emulator transport_id:1
192.168.1.105:5555     device product:husky model:Pixel_8_Pro device:husky transport_id:2
12345ABCDEF           unauthorized usb:1-1 transport_id:3
OLD987654             offline transport_id:4
NO_PERM_DEV           no permissions (missing udev rules); see [http://developer.android.com/tools/device.html] usb:1-2 transport_id:5
"#;

    let parsed = DeviceService::parse_devices_output(mock_output);
    assert_eq!(parsed.len(), 5);

    // Emulator
    assert_eq!(parsed[0].0, "emulator-5554");
    assert_eq!(parsed[0].1, DeviceStatus::Authorized);
    assert_eq!(parsed[0].2, Some("Pixel 7".to_string()));

    // Wireless
    assert_eq!(parsed[1].0, "192.168.1.105:5555");
    assert_eq!(parsed[1].1, DeviceStatus::Authorized);
    assert_eq!(parsed[1].2, Some("Pixel 8 Pro".to_string()));

    // Unauthorized
    assert_eq!(parsed[2].0, "12345ABCDEF");
    assert_eq!(parsed[2].1, DeviceStatus::Unauthorized);

    // Offline
    assert_eq!(parsed[3].0, "OLD987654");
    assert_eq!(parsed[3].1, DeviceStatus::Offline);

    // No permissions
    assert_eq!(parsed[4].0, "NO_PERM_DEV");
    assert_eq!(parsed[4].1, DeviceStatus::NoPermissions);
}

#[test]
fn test_remote_ls_parsing_with_unicode_and_symlinks() {
    let mock_ls = r#"total 24
drwxrwx--x  4 root sdcard_rw 4096 2026-03-01 12:00 .
drwxr-xr-x 12 root root      4096 2026-02-15 10:30 ..
-rw-rw-r--  1 u0_a123 u0_a123 1048576 2026-03-01 12:00 video with spaces.mp4
drwxrwxr-x  2 root sdcard_rw 4096 2026-02-15 10:30 Download
lrwxrwxrwx  1 root root        21 2026-01-01 00:00 sdcard -> /storage/emulated/0
-rw-rw-r--  1 u0_a123 u0_a123  2048 2026-01-10 09:15 拍照_photo.jpg
-rw-rw-r--  1 u0_a123 u0_a123   512 2026-01-10 09:15 .hidden_config.json
ls: /sdcard/protected: Permission denied
"#;

    // Test with hidden files excluded
    let (entries, warnings) = RemoteFsService::parse_remote_ls_output(mock_ls, "/sdcard", false);

    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("Permission denied"));

    // Expected visible entries: Download (dir), sdcard (symlink/dir), video with spaces.mp4, 拍照_photo.jpg
    // . and .. and .hidden_config.json should be omitted
    assert_eq!(entries.len(), 4);

    // Dirs come first
    assert!(entries[0].is_dir);
    assert_eq!(entries[0].name, "Download");

    assert!(entries[1].is_dir);
    assert_eq!(entries[1].name, "sdcard");
    assert!(entries[1].is_symlink);
    assert_eq!(entries[1].symlink_target, Some("/storage/emulated/0".to_string()));

    // Unicode entry check
    let photo_entry = entries.iter().find(|e| e.name == "拍照_photo.jpg").unwrap();
    assert_eq!(photo_entry.size, 2048);
    assert_eq!(photo_entry.path, "/sdcard/拍照_photo.jpg");

    // File with spaces check
    let video_entry = entries.iter().find(|e| e.name == "video with spaces.mp4").unwrap();
    assert_eq!(video_entry.size, 1048576);

    // Test with hidden files included
    let (entries_with_hidden, _) = RemoteFsService::parse_remote_ls_output(mock_ls, "/sdcard", true);
    assert_eq!(entries_with_hidden.len(), 5);
    assert!(entries_with_hidden.iter().any(|e| e.name == ".hidden_config.json"));
}

#[test]
fn test_settings_store_persistence() {
    let tmp = NamedTempFile::new().expect("Create temp file");
    let store = SettingsStore::new(tmp.path());

    let initial = store.get();
    assert_eq!(initial.theme, "system");
    assert_eq!(initial.max_concurrency, 2);

    let mut updated = initial.clone();
    updated.theme = "dark".into();
    updated.max_concurrency = 4;
    updated.show_hidden_files = true;

    store.save(updated.clone()).expect("Save settings");

    let reloaded = store.get();
    assert_eq!(reloaded.theme, "dark");
    assert_eq!(reloaded.max_concurrency, 4);
    assert!(reloaded.show_hidden_files);

    // Reset settings
    let reset = store.reset().expect("Reset settings");
    assert_eq!(reset.theme, "system");
    assert_eq!(reset.max_concurrency, 2);
}

#[test]
fn test_sqlite_history_db() {
    let tmp = NamedTempFile::new().expect("Create temp file");
    let db = HistoryDb::new(tmp.path()).expect("Init history db");

    let item = TransferHistoryItem {
        id: "test-uuid-123".into(),
        device_serial: Some("device-1234".into()),
        source_path: "/home/user/document.pdf".into(),
        dest_path: "/sdcard/Download/document.pdf".into(),
        direction: "LocalToRemote".into(),
        total_bytes: 4096,
        status: "completed".into(),
        error_message: None,
        started_at: 1000,
        completed_at: 2000,
        duration_secs: 1.0,
    };

    db.record(&item).expect("Record transfer history");

    let history = db.get_history(10, 0).expect("Get history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, "test-uuid-123");
    assert_eq!(history[0].total_bytes, 4096);
    assert_eq!(history[0].status, "completed");

    db.clear_history().expect("Clear history");
    let history_empty = db.get_history(10, 0).expect("Get history after clear");
    assert_eq!(history_empty.len(), 0);
}

#[test]
fn test_diagnostic_logger_and_redaction() {
    let logger = DiagnosticLogger::new(10);
    logger.info("ADB", "Starting discovery");
    logger.info("WIRELESS", "Attempting pair with pairing code: 123456 on port 5555");
    logger.error("TRANSFER", "Transfer failed for /sdcard/Download");

    let logs = logger.get_logs();
    assert_eq!(logs.len(), 3);

    // Check pairing code redaction
    assert!(!logs[1].message.contains("123456"));
    assert!(logs[1].message.contains("******"));

    let report = logger.export_report("/usr/bin/adb", "1.0.41");
    assert_eq!(report.adb_path, "/usr/bin/adb");
    assert_eq!(report.adb_version, "1.0.41");
    assert_eq!(report.logs.len(), 3);
}

#[test]
fn test_local_filesystem_operations() {
    let tmp_dir = tempfile::tempdir().expect("Create temp dir");
    let base_path = tmp_dir.path().to_string_lossy().to_string();

    // Create subfolder
    let subfolder = format!("{}/test_subfolder", base_path);
    LocalFsService::create_directory(&subfolder).expect("Create subfolder");

    // Write a test file
    let file_path = format!("{}/hello.txt", base_path);
    std::fs::write(&file_path, "Hello ADB").expect("Write file");

    let entries = LocalFsService::list_directory(&base_path, true).expect("List directory");
    assert_eq!(entries.len(), 2);

    // Folder must come first
    assert!(entries[0].is_dir);
    assert_eq!(entries[0].name, "test_subfolder");

    assert!(!entries[1].is_dir);
    assert_eq!(entries[1].name, "hello.txt");
    assert_eq!(entries[1].size, 9);

    // Rename item
    let renamed_path = format!("{}/renamed.txt", base_path);
    LocalFsService::rename_item(&file_path, &renamed_path).expect("Rename item");
    assert!(std::path::Path::new(&renamed_path).exists());
    assert!(!std::path::Path::new(&file_path).exists());

    // Delete item
    LocalFsService::delete_items(&[renamed_path]).expect("Delete item");
    let after_delete = LocalFsService::list_directory(&base_path, true).expect("List directory");
    assert_eq!(after_delete.len(), 1);
}
