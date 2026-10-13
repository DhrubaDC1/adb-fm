use crate::adb::command::AdbCommandRunner;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbVersionInfo {
    pub version: String,
    pub revision: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct AdbManager {
    current_path: PathBuf,
}

impl AdbManager {
    pub fn new(custom_path: Option<&str>) -> Self {
        let path = Self::discover_adb(custom_path);
        Self { current_path: path }
    }

    pub fn current_path(&self) -> &Path {
        &self.current_path
    }

    pub fn set_path(&mut self, path: PathBuf) {
        self.current_path = path;
    }

    pub fn runner(&self) -> AdbCommandRunner {
        AdbCommandRunner::new(&self.current_path)
    }

    /// Discover ADB executable path
    pub fn discover_adb(custom_path: Option<&str>) -> PathBuf {
        if let Some(custom) = custom_path {
            let custom_buf = PathBuf::from(custom);
            if custom_buf.is_file() {
                return custom_buf;
            }
        }

        // Try standard PATH lookup
        if let Ok(path) = which::which("adb") {
            return path;
        }

        // Candidate paths across platforms
        let mut candidates = Vec::new();

        if let Some(home) = dirs::home_dir() {
            // Linux & macOS common SDK paths
            candidates.push(home.join("Android/Sdk/platform-tools/adb"));
            candidates.push(home.join(".local/share/android-sdk/platform-tools/adb"));
            candidates.push(home.join("Library/Android/sdk/platform-tools/adb"));
            // Windows common SDK paths
            candidates.push(home.join("AppData/Local/Android/Sdk/platform-tools/adb.exe"));
        }

        // System directories
        candidates.push(PathBuf::from("/usr/bin/adb"));
        candidates.push(PathBuf::from("/usr/local/bin/adb"));
        candidates.push(PathBuf::from("/opt/android-sdk/platform-tools/adb"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/adb"));

        for cand in candidates {
            if cand.is_file() {
                return cand;
            }
        }

        PathBuf::from("adb")
    }

    /// Retrieve ADB version information
    pub async fn get_version(&self) -> AppResult<AdbVersionInfo> {
        let runner = self.runner();
        let output = runner.execute(&["version"], Some(Duration::from_secs(10))).await?;

        if !output.success && output.stdout.is_empty() {
            return Err(AppError::AdbCommandFailed {
                cmd: "adb version".into(),
                code: output.status_code,
                stderr: output.stderr,
            });
        }

        let full_text = format!("{}\n{}", output.stdout, output.stderr);
        let mut version = "Unknown".to_string();
        let mut revision = "".to_string();

        for line in full_text.lines() {
            if line.contains("Android Debug Bridge version") {
                if let Some(ver) = line.split("version").nth(1) {
                    version = ver.trim().to_string();
                }
            } else if line.contains("Version") {
                revision = line.trim().to_string();
            }
        }

        Ok(AdbVersionInfo {
            version,
            revision,
            path: self.current_path.to_string_lossy().to_string(),
        })
    }

    /// Start ADB server
    pub async fn start_server(&self) -> AppResult<String> {
        let runner = self.runner();
        let output = runner.execute(&["start-server"], Some(Duration::from_secs(15))).await?;
        if output.success {
            Ok("ADB server running".into())
        } else {
            Err(AppError::AdbCommandFailed {
                cmd: "adb start-server".into(),
                code: output.status_code,
                stderr: output.stderr,
            })
        }
    }

    /// Kill ADB server
    pub async fn kill_server(&self) -> AppResult<String> {
        let runner = self.runner();
        let output = runner.execute(&["kill-server"], Some(Duration::from_secs(10))).await?;
        if output.success {
            Ok("ADB server stopped".into())
        } else {
            Err(AppError::AdbCommandFailed {
                cmd: "adb kill-server".into(),
                code: output.status_code,
                stderr: output.stderr,
            })
        }
    }

    /// Restart ADB server
    pub async fn restart_server(&self) -> AppResult<String> {
        let _ = self.kill_server().await;
        tokio::time::sleep(Duration::from_millis(500)).await;
        self.start_server().await
    }
}
