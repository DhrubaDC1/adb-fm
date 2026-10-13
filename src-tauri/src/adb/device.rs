use crate::adb::command::AdbCommandRunner;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceStatus {
    Authorized,
    Unauthorized,
    Offline,
    NoPermissions,
    Recovery,
    Bootloader,
    Unknown(String),
}

impl DeviceStatus {
    pub fn from_str_val(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "device" => DeviceStatus::Authorized,
            "unauthorized" => DeviceStatus::Unauthorized,
            "offline" => DeviceStatus::Offline,
            "no permissions" | "no_permissions" => DeviceStatus::NoPermissions,
            "recovery" => DeviceStatus::Recovery,
            "bootloader" => DeviceStatus::Bootloader,
            other => DeviceStatus::Unknown(other.to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceConnectionKind {
    Usb,
    Wireless,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub serial: String,
    pub status: DeviceStatus,
    pub connection_type: DeviceConnectionKind,
    pub model: String,
    pub manufacturer: String,
    pub android_version: String,
    pub api_level: String,
    pub battery_level: Option<u8>,
    pub storage_free_bytes: Option<u64>,
    pub storage_total_bytes: Option<u64>,
}

pub struct DeviceService;

impl DeviceService {
    /// Parse raw output of `adb devices -l`
    pub fn parse_devices_output(output: &str) -> Vec<(String, DeviceStatus, Option<String>, Option<String>)> {
        let mut devices = Vec::new();

        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("List of devices attached") || trimmed.starts_with("* daemon") {
                continue;
            }

            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.is_empty() {
                continue;
            }

            let serial = parts[0].to_string();
            let mut status = DeviceStatus::Unknown("unknown".to_string());
            let mut model = None;
            let mut product = None;

            if parts.len() > 1 {
                // If parts[1] is "no" and parts[2] is "permissions"
                if parts[1] == "no" && parts.len() > 2 && parts[2] == "permissions" {
                    status = DeviceStatus::NoPermissions;
                } else {
                    status = DeviceStatus::from_str_val(parts[1]);
                }
            }

            for part in &parts[2..] {
                if let Some(m) = part.strip_prefix("model:") {
                    model = Some(m.replace('_', " "));
                } else if let Some(p) = part.strip_prefix("product:") {
                    product = Some(p.replace('_', " "));
                }
            }

            devices.push((serial, status, model, product));
        }

        devices
    }

    /// List all devices connected via ADB
    pub async fn list_devices(runner: &AdbCommandRunner) -> AppResult<Vec<DeviceInfo>> {
        let output = runner.execute(&["devices", "-l"], Some(Duration::from_secs(10))).await?;

        let parsed = Self::parse_devices_output(&output.stdout);
        let mut devices = Vec::new();

        for (serial, status, quick_model, _) in parsed {
            let is_wireless = serial.contains(':') && serial.split(':').count() == 2;
            let connection_type = if is_wireless {
                DeviceConnectionKind::Wireless
            } else {
                DeviceConnectionKind::Usb
            };

            let mut info = DeviceInfo {
                serial: serial.clone(),
                status: status.clone(),
                connection_type,
                model: quick_model.unwrap_or_else(|| "Android Device".to_string()),
                manufacturer: "".to_string(),
                android_version: "".to_string(),
                api_level: "".to_string(),
                battery_level: None,
                storage_free_bytes: None,
                storage_total_bytes: None,
            };

            // If device is authorized, enrich with getprop & storage info
            if status == DeviceStatus::Authorized {
                if let Ok(details) = Self::get_device_properties(runner, &serial).await {
                    if !details.0.is_empty() {
                        info.model = details.0;
                    }
                    info.manufacturer = details.1;
                    info.android_version = details.2;
                    info.api_level = details.3;
                }

                // Storage info
                if let Ok((free, total)) = Self::get_storage_info(runner, &serial).await {
                    info.storage_free_bytes = free;
                    info.storage_total_bytes = total;
                }

                // Battery info
                if let Ok(bat) = Self::get_battery_level(runner, &serial).await {
                    info.battery_level = Some(bat);
                }
            }

            devices.push(info);
        }

        Ok(devices)
    }

    /// Query device properties: (model, manufacturer, release_version, sdk_version)
    pub async fn get_device_properties(
        runner: &AdbCommandRunner,
        serial: &str,
    ) -> AppResult<(String, String, String, String)> {
        // Query getprop in one batch command to avoid multiple slow adb roundtrips
        let script = "echo MODEL=$(getprop ro.product.model); echo MFR=$(getprop ro.product.manufacturer); echo VER=$(getprop ro.build.version.release); echo SDK=$(getprop ro.build.version.sdk)";
        let output = runner.execute_shell(serial, script, Some(Duration::from_secs(5))).await?;

        let mut model = String::new();
        let mut mfr = String::new();
        let mut ver = String::new();
        let mut sdk = String::new();

        for line in output.stdout.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("MODEL=") {
                model = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("MFR=") {
                mfr = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("VER=") {
                ver = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("SDK=") {
                sdk = val.trim().to_string();
            }
        }

        Ok((model, mfr, ver, sdk))
    }

    /// Query available and total storage in bytes for /sdcard
    pub async fn get_storage_info(
        runner: &AdbCommandRunner,
        serial: &str,
    ) -> AppResult<(Option<u64>, Option<u64>)> {
        // Run `df -k /sdcard`
        let output = runner.execute_device(serial, &["shell", "df", "-k", "/sdcard"], Some(Duration::from_secs(5))).await?;
        if !output.success {
            return Ok((None, None));
        }

        for line in output.stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // Typical df output: Filesystem 1K-blocks Used Available Use% Mounted on
            // Or: /dev/... 123456 1234 120000 ...
            if parts.len() >= 4 {
                let total_kb = parts[1].parse::<u64>().ok();
                let free_kb = parts[3].parse::<u64>().ok();
                if let (Some(tot), Some(fr)) = (total_kb, free_kb) {
                    return Ok((Some(fr * 1024), Some(tot * 1024)));
                }
            }
        }

        Ok((None, None))
    }

    /// Query battery level percentage (0-100)
    pub async fn get_battery_level(runner: &AdbCommandRunner, serial: &str) -> AppResult<u8> {
        let output = runner.execute_device(serial, &["shell", "dumpsys", "battery"], Some(Duration::from_secs(5))).await?;
        for line in output.stdout.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("level:") {
                if let Some(val_str) = trimmed.split(':').nth(1) {
                    if let Ok(lvl) = val_str.trim().parse::<u8>() {
                        return Ok(lvl);
                    }
                }
            }
        }
        Err(AppError::RemoteIo("Could not read battery level".into()))
    }
}
