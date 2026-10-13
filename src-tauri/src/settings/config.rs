use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String, // "system", "dark", "light"
    pub adb_executable_path: Option<String>,
    pub default_local_dir: Option<String>,
    pub default_remote_dir: Option<String>,
    pub max_concurrency: usize,
    pub conflict_behavior: String, // "ask", "overwrite", "skip", "rename"
    pub verify_transfers: bool,
    pub show_hidden_files: bool,
    pub auto_refresh_devices: bool,
    pub auto_refresh_interval_secs: u64,
    pub favorite_destinations_local: Vec<String>,
    pub favorite_destinations_remote: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let home = dirs::home_dir().map(|p| p.to_string_lossy().to_string());
        Self {
            theme: "system".into(),
            adb_executable_path: None,
            default_local_dir: home,
            default_remote_dir: Some("/sdcard".into()),
            max_concurrency: 2,
            conflict_behavior: "ask".into(),
            verify_transfers: true,
            show_hidden_files: false,
            auto_refresh_devices: true,
            auto_refresh_interval_secs: 5,
            favorite_destinations_local: Vec::new(),
            favorite_destinations_remote: vec![
                "/sdcard/Download".into(),
                "/sdcard/DCIM".into(),
                "/sdcard/Pictures".into(),
                "/sdcard/Documents".into(),
            ],
        }
    }
}

pub struct SettingsStore {
    file_path: PathBuf,
    settings: Mutex<AppSettings>,
}

impl SettingsStore {
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        let file_path = path.as_ref().to_path_buf();
        let loaded = Self::load_from_disk(&file_path).unwrap_or_default();
        Self {
            file_path,
            settings: Mutex::new(loaded),
        }
    }

    pub fn default_path() -> PathBuf {
        let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        dir.push("droidbridge");
        let _ = fs::create_dir_all(&dir);
        dir.push("settings.json");
        dir
    }

    fn load_from_disk(path: &Path) -> AppResult<AppSettings> {
        if !path.exists() {
            return Ok(AppSettings::default());
        }
        let data = fs::read_to_string(path).map_err(|e| AppError::Config(e.to_string()))?;
        let parsed = serde_json::from_str(&data).map_err(|e| AppError::Config(e.to_string()))?;
        Ok(parsed)
    }

    pub fn get(&self) -> AppSettings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn save(&self, new_settings: AppSettings) -> AppResult<()> {
        let data = serde_json::to_string_pretty(&new_settings)
            .map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(parent) = self.file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&self.file_path, data).map_err(|e| AppError::Config(e.to_string()))?;

        if let Ok(mut lock) = self.settings.lock() {
            *lock = new_settings;
        }

        Ok(())
    }

    pub fn reset(&self) -> AppResult<AppSettings> {
        let default = AppSettings::default();
        self.save(default.clone())?;
        Ok(default)
    }
}
