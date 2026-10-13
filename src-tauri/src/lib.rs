pub mod adb;
pub mod db;
pub mod diagnostics;
pub mod error;
pub mod fs;
pub mod settings;
pub mod transfer;

use std::sync::{Arc, Mutex};
use tauri::State;

use adb::{
    AdbManager, AdbVersionInfo, DeviceInfo, DeviceService, WirelessConnectRequest,
    WirelessOperationResult, WirelessPairRequest, WirelessService,
};
use db::{HistoryDb, TransferHistoryItem};
use diagnostics::{DiagnosticLogger, SystemDiagnosticsReport};
use error::AppError;
use fs::{FileEntry, LocalFsService, RemoteFsService, RemoteShortcut, StandardPaths};
use settings::{AppSettings, SettingsStore};
use transfer::{ConflictPolicy, TransferDirection, TransferEngine, TransferJob};

pub struct AppState {
    pub adb_manager: Arc<Mutex<AdbManager>>,
    pub transfer_engine: Arc<TransferEngine>,
    pub history_db: Arc<HistoryDb>,
    pub settings_store: Arc<SettingsStore>,
    pub diagnostics: Arc<DiagnosticLogger>,
}

// ----------------- ADB Commands -----------------

#[tauri::command]
async fn get_adb_version(state: State<'_, AppState>) -> Result<AdbVersionInfo, AppError> {
    let mgr = state.adb_manager.lock().unwrap().clone();
    let res = mgr.get_version().await;
    match &res {
        Ok(v) => state.diagnostics.info("ADB", &format!("Detected ADB version: {}", v.version)),
        Err(e) => state.diagnostics.error("ADB", &format!("Failed to get ADB version: {}", e)),
    }
    res
}

#[tauri::command]
async fn start_adb_server(state: State<'_, AppState>) -> Result<String, AppError> {
    let mgr = state.adb_manager.lock().unwrap().clone();
    let res = mgr.start_server().await;
    state.diagnostics.info("ADB", "Started ADB server");
    res
}

#[tauri::command]
async fn kill_adb_server(state: State<'_, AppState>) -> Result<String, AppError> {
    let mgr = state.adb_manager.lock().unwrap().clone();
    let res = mgr.kill_server().await;
    state.diagnostics.info("ADB", "Killed ADB server");
    res
}

#[tauri::command]
async fn restart_adb_server(state: State<'_, AppState>) -> Result<String, AppError> {
    let mgr = state.adb_manager.lock().unwrap().clone();
    let res = mgr.restart_server().await;
    state.diagnostics.info("ADB", "Restarted ADB server");
    res
}

#[tauri::command]
async fn list_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = DeviceService::list_devices(&runner).await;
    match &res {
        Ok(devs) => {
            state.diagnostics.info("ADB", &format!("Found {} attached devices", devs.len()));
        }
        Err(e) => {
            state.diagnostics.warn("ADB", &format!("Failed to list devices: {}", e));
        }
    }
    res
}

#[tauri::command]
async fn get_device_storage(
    serial: String,
    state: State<'_, AppState>,
) -> Result<(Option<u64>, Option<u64>), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    DeviceService::get_storage_info(&runner, &serial).await
}

// ----------------- Wireless Commands -----------------

#[tauri::command]
async fn wireless_pair(
    req: WirelessPairRequest,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    state.diagnostics.info("WIRELESS", &format!("Attempting to pair with {}:{}", req.ip, req.port));
    let res = WirelessService::pair(&runner, &req.ip, req.port, &req.pairing_code).await;
    match &res {
        Ok(_) => state.diagnostics.info("WIRELESS", &format!("Pairing successful with {}:{}", req.ip, req.port)),
        Err(e) => state.diagnostics.error("WIRELESS", &format!("Pairing failed: {}", e)),
    }
    res
}

#[tauri::command]
async fn wireless_connect(
    req: WirelessConnectRequest,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    state.diagnostics.info("WIRELESS", &format!("Attempting connection to {}:{}", req.ip, req.port));
    let res = WirelessService::connect(&runner, &req.ip, req.port).await;
    match &res {
        Ok(_) => state.diagnostics.info("WIRELESS", &format!("Connected to {}:{}", req.ip, req.port)),
        Err(e) => state.diagnostics.error("WIRELESS", &format!("Connection failed: {}", e)),
    }
    res
}

#[tauri::command]
async fn wireless_disconnect(
    ip: String,
    port: u16,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = WirelessService::disconnect(&runner, &ip, port).await;
    state.diagnostics.info("WIRELESS", &format!("Disconnected from {}:{}", ip, port));
    res
}

#[tauri::command]
async fn enable_tcpip(
    serial: String,
    port: u16,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = WirelessService::enable_tcpip(&runner, &serial, port).await;
    state.diagnostics.info("WIRELESS", &format!("Enabled TCPIP mode on {}: port {}", serial, port));
    res
}

#[tauri::command]
async fn get_device_ip(
    serial: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = WirelessService::get_device_ip(&runner, &serial).await;
    match &res {
        Ok(Some(ip)) => state.diagnostics.info("WIRELESS", &format!("Detected IP for {}: {}", serial, ip)),
        Ok(None) => state.diagnostics.info("WIRELESS", &format!("Could not auto-detect Wi-Fi IP for {}", serial)),
        Err(e) => state.diagnostics.error("WIRELESS", &format!("Failed to query IP for {}: {}", serial, e)),
    }
    res
}

#[tauri::command]
async fn switch_to_wireless(
    serial: String,
    port: u16,
    ip: Option<String>,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    state.diagnostics.info(
        "WIRELESS",
        &format!("Switching {} to wireless mode on port {} (ip: {:?})", serial, port, ip),
    );
    let res = WirelessService::switch_to_wireless(&runner, &serial, port, ip).await;
    match &res {
        Ok(r) => state.diagnostics.info("WIRELESS", &format!("Switched to wireless successfully: {}", r.endpoint)),
        Err(e) => state.diagnostics.error("WIRELESS", &format!("Switch to wireless failed: {}", e)),
    }
    res
}

#[tauri::command]
async fn reset_to_usb(
    serial: String,
    state: State<'_, AppState>,
) -> Result<WirelessOperationResult, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = WirelessService::reset_to_usb(&runner, &serial).await;
    state.diagnostics.info("WIRELESS", &format!("Reset {} back to USB mode", serial));
    res
}

// ----------------- Local FS Commands -----------------

#[tauri::command]
fn get_standard_paths() -> StandardPaths {
    LocalFsService::get_standard_paths()
}

#[tauri::command]
fn list_local_directory(
    path: String,
    show_hidden: bool,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, AppError> {
    let res = LocalFsService::list_directory(&path, show_hidden);
    if let Err(e) = &res {
        state.diagnostics.warn("LOCAL_FS", &format!("Failed to list {}: {}", path, e));
    }
    res
}

#[tauri::command]
fn create_local_directory(
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let res = LocalFsService::create_directory(&path);
    state.diagnostics.info("LOCAL_FS", &format!("Created local directory: {}", path));
    res
}

#[tauri::command]
fn rename_local_item(
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let res = LocalFsService::rename_item(&old_path, &new_path);
    state.diagnostics.info("LOCAL_FS", &format!("Renamed local: {} -> {}", old_path, new_path));
    res
}

#[tauri::command]
fn delete_local_items(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let res = LocalFsService::delete_items(&paths);
    state.diagnostics.info("LOCAL_FS", &format!("Deleted {} local items", paths.len()));
    res
}

#[tauri::command]
fn copy_local_items(
    sources: Vec<String>,
    dest_dir: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let res = LocalFsService::copy_items(&sources, &dest_dir);
    state.diagnostics.info("LOCAL_FS", &format!("Copied {} local items to {}", sources.len(), dest_dir));
    res
}

#[tauri::command]
fn move_local_items(
    sources: Vec<String>,
    dest_dir: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let res = LocalFsService::move_items(&sources, &dest_dir);
    state.diagnostics.info("LOCAL_FS", &format!("Moved {} local items to {}", sources.len(), dest_dir));
    res
}

#[tauri::command]
fn open_local_path(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::LocalIo(e.to_string()))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::LocalIo(e.to_string()))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::LocalIo(e.to_string()))?;
    }
    Ok(())
}

// ----------------- Remote FS Commands -----------------

#[tauri::command]
fn get_remote_shortcuts() -> Vec<RemoteShortcut> {
    RemoteFsService::get_shortcuts()
}

#[tauri::command]
async fn list_remote_directory(
    serial: String,
    path: String,
    show_hidden: bool,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::list_directory(&runner, &serial, &path, show_hidden).await;
    if let Err(e) = &res {
        state.diagnostics.warn("REMOTE_FS", &format!("Failed to list remote {}: {}", path, e));
    }
    res
}

#[tauri::command]
async fn create_remote_directory(
    serial: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::create_directory(&runner, &serial, &path).await;
    state.diagnostics.info("REMOTE_FS", &format!("Created remote dir {}: {}", serial, path));
    res
}

#[tauri::command]
async fn rename_remote_item(
    serial: String,
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::rename_item(&runner, &serial, &old_path, &new_path).await;
    state.diagnostics.info("REMOTE_FS", &format!("Renamed remote {}: {} -> {}", serial, old_path, new_path));
    res
}

#[tauri::command]
async fn delete_remote_items(
    serial: String,
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::delete_items(&runner, &serial, &paths).await;
    state.diagnostics.info("REMOTE_FS", &format!("Deleted {} remote items on {}", paths.len(), serial));
    res
}

#[tauri::command]
async fn copy_remote_items(
    serial: String,
    sources: Vec<String>,
    dest_dir: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::copy_items(&runner, &serial, &sources, &dest_dir).await;
    state.diagnostics.info("REMOTE_FS", &format!("Copied {} remote items to {}", sources.len(), dest_dir));
    res
}

#[tauri::command]
async fn move_remote_items(
    serial: String,
    sources: Vec<String>,
    dest_dir: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    let res = RemoteFsService::move_items(&runner, &serial, &sources, &dest_dir).await;
    state.diagnostics.info("REMOTE_FS", &format!("Moved {} remote items to {}", sources.len(), dest_dir));
    res
}

#[tauri::command]
async fn search_remote(
    serial: String,
    base_path: String,
    query: String,
    recursive: bool,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, AppError> {
    let runner = state.adb_manager.lock().unwrap().runner();
    RemoteFsService::search(&runner, &serial, &base_path, &query, recursive, 100).await
}

// ----------------- Transfer Commands -----------------

#[tauri::command]
fn enqueue_transfer(
    device_serial: Option<String>,
    direction: TransferDirection,
    source_paths: Vec<String>,
    dest_dir: String,
    conflict_policy: ConflictPolicy,
    state: State<'_, AppState>,
) -> String {
    let id = state.transfer_engine.enqueue(
        device_serial,
        direction,
        source_paths,
        dest_dir,
        conflict_policy,
    );
    state.diagnostics.info("TRANSFER", &format!("Enqueued transfer job: {}", id));
    id
}

#[tauri::command]
fn cancel_transfer(job_id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.diagnostics.info("TRANSFER", &format!("Cancelling transfer job: {}", job_id));
    state.transfer_engine.cancel(&job_id)
}

#[tauri::command]
fn retry_transfer(job_id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.diagnostics.info("TRANSFER", &format!("Retrying transfer job: {}", job_id));
    state.transfer_engine.retry(&job_id)
}

#[tauri::command]
fn clear_finished_transfers(state: State<'_, AppState>) {
    state.transfer_engine.clear_finished();
}

#[tauri::command]
fn get_transfers(state: State<'_, AppState>) -> Vec<TransferJob> {
    state.transfer_engine.get_jobs()
}

#[tauri::command]
fn get_transfer_history(
    limit: usize,
    offset: usize,
    state: State<'_, AppState>,
) -> Result<Vec<TransferHistoryItem>, AppError> {
    state.history_db.get_history(limit, offset)
}

#[tauri::command]
fn clear_transfer_history(state: State<'_, AppState>) -> Result<(), AppError> {
    state.history_db.clear_history()
}

// ----------------- Settings Commands -----------------

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings_store.get()
}

#[tauri::command]
fn save_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if let Some(custom_adb) = &settings.adb_executable_path {
        let mut mgr = state.adb_manager.lock().unwrap();
        mgr.set_path(std::path::PathBuf::from(custom_adb));
    }
    state.settings_store.save(settings)
}

#[tauri::command]
fn reset_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    state.settings_store.reset()
}

// ----------------- Diagnostics Commands -----------------

#[tauri::command]
async fn get_diagnostics_report(
    state: State<'_, AppState>,
) -> Result<SystemDiagnosticsReport, AppError> {
    let mgr = state.adb_manager.lock().unwrap().clone();
    let ver_info = mgr.get_version().await.unwrap_or(AdbVersionInfo {
        version: "Unknown".into(),
        revision: "".into(),
        path: mgr.current_path().to_string_lossy().to_string(),
    });
    Ok(state.diagnostics.export_report(&ver_info.path, &ver_info.version))
}

#[tauri::command]
fn log_diagnostic_message(
    level: String,
    category: String,
    message: String,
    state: State<'_, AppState>,
) {
    state.diagnostics.log(&level, &category, &message);
}

#[tauri::command]
fn clear_diagnostics(state: State<'_, AppState>) {
    state.diagnostics.clear();
}

// ----------------- Application Entrypoint -----------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings_store = Arc::new(SettingsStore::new(SettingsStore::default_path()));
    let initial_settings = settings_store.get();

    let adb_manager = Arc::new(Mutex::new(AdbManager::new(
        initial_settings.adb_executable_path.as_deref(),
    )));

    let history_db = Arc::new(
        HistoryDb::new(HistoryDb::default_path()).expect("Failed to initialize SQLite history db"),
    );

    let diagnostics = Arc::new(DiagnosticLogger::new(1000));
    diagnostics.info("APP", "DroidBridge initialized");

    let transfer_engine = Arc::new(TransferEngine::new(
        initial_settings.max_concurrency,
        Arc::clone(&history_db),
    ));

    let adb_runner_for_engine = adb_manager.lock().unwrap().runner();
    let transfer_engine_for_setup = Arc::clone(&transfer_engine);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            adb_manager,
            transfer_engine,
            history_db,
            settings_store,
            diagnostics,
        })
        .setup(move |app| {
            // Start the background transfer queue worker loop
            let handle = app.handle().clone();
            transfer_engine_for_setup.start_worker_loop(adb_runner_for_engine, handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_adb_version,
            start_adb_server,
            kill_adb_server,
            restart_adb_server,
            list_devices,
            get_device_storage,
            wireless_pair,
            wireless_connect,
            wireless_disconnect,
            enable_tcpip,
            get_device_ip,
            switch_to_wireless,
            reset_to_usb,
            get_standard_paths,
            list_local_directory,
            create_local_directory,
            rename_local_item,
            delete_local_items,
            copy_local_items,
            move_local_items,
            open_local_path,
            get_remote_shortcuts,
            list_remote_directory,
            create_remote_directory,
            rename_remote_item,
            delete_remote_items,
            copy_remote_items,
            move_remote_items,
            search_remote,
            enqueue_transfer,
            cancel_transfer,
            retry_transfer,
            clear_finished_transfers,
            get_transfers,
            get_transfer_history,
            clear_transfer_history,
            get_settings,
            save_settings,
            reset_settings,
            get_diagnostics_report,
            log_diagnostic_message,
            clear_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DroidBridge");
}
