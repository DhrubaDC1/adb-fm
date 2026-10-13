use crate::adb::command::AdbCommandRunner;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WirelessPairRequest {
    pub ip: String,
    pub port: u16,
    pub pairing_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WirelessConnectRequest {
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WirelessOperationResult {
    pub success: bool,
    pub message: String,
    pub endpoint: String,
}

pub struct WirelessService;

impl WirelessService {
    /// Perform modern Android Wireless Debugging pairing
    pub async fn pair(
        runner: &AdbCommandRunner,
        ip: &str,
        port: u16,
        code: &str,
    ) -> AppResult<WirelessOperationResult> {
        let endpoint = format!("{}:{}", ip.trim(), port);
        let code_trimmed = code.trim();

        if ip.trim().is_empty() || port == 0 || code_trimmed.is_empty() {
            return Err(AppError::InvalidArgument(
                "IP address, port, and pairing code must not be empty".into(),
            ));
        }

        let output = runner
            .execute(&["pair", &endpoint, code_trimmed], Some(Duration::from_secs(20)))
            .await?;

        let combined = format!("{}\n{}", output.stdout, output.stderr);
        let is_success = output.success
            && (combined.to_lowercase().contains("successfully paired")
                || combined.to_lowercase().contains("paired to"));

        if is_success {
            Ok(WirelessOperationResult {
                success: true,
                message: format!("Successfully paired with {}", endpoint),
                endpoint,
            })
        } else {
            let msg = if combined.trim().is_empty() {
                "Pairing failed. Ensure Wireless Debugging is enabled on the device and code is valid."
                    .to_string()
            } else {
                combined.trim().to_string()
            };
            Err(AppError::WirelessPairingFailed(msg))
        }
    }

    /// Connect to wireless device endpoint
    pub async fn connect(
        runner: &AdbCommandRunner,
        ip: &str,
        port: u16,
    ) -> AppResult<WirelessOperationResult> {
        let endpoint = format!("{}:{}", ip.trim(), port);

        if ip.trim().is_empty() || port == 0 {
            return Err(AppError::InvalidArgument(
                "IP address and port must not be empty".into(),
            ));
        }

        let output = runner
            .execute(&["connect", &endpoint], Some(Duration::from_secs(15)))
            .await?;

        let combined = format!("{}\n{}", output.stdout, output.stderr);
        let is_success = output.success
            && (combined.to_lowercase().contains("connected to")
                || combined.to_lowercase().contains("already connected"));

        if is_success {
            Ok(WirelessOperationResult {
                success: true,
                message: format!("Connected to {}", endpoint),
                endpoint,
            })
        } else {
            let msg = if combined.trim().is_empty() {
                format!("Failed to connect to {}. Ensure the phone is connected to the same Wi-Fi network.", endpoint)
            } else {
                combined.trim().to_string()
            };
            Err(AppError::WirelessConnectionFailed(msg))
        }
    }

    /// Disconnect wireless device
    pub async fn disconnect(
        runner: &AdbCommandRunner,
        ip: &str,
        port: u16,
    ) -> AppResult<WirelessOperationResult> {
        let endpoint = format!("{}:{}", ip.trim(), port);
        let output = runner
            .execute(&["disconnect", &endpoint], Some(Duration::from_secs(10)))
            .await?;

        Ok(WirelessOperationResult {
            success: output.success,
            message: format!("Disconnected from {}", endpoint),
            endpoint,
        })
    }

    /// Enable legacy ADB-over-TCP mode on an already connected USB device
    pub async fn enable_tcpip(
        runner: &AdbCommandRunner,
        serial: &str,
        port: u16,
    ) -> AppResult<WirelessOperationResult> {
        let port_str = port.to_string();
        let output = runner
            .execute_device(serial, &["tcpip", &port_str], Some(Duration::from_secs(15)))
            .await?;

        if output.success {
            Ok(WirelessOperationResult {
                success: true,
                message: format!("Device restarted in TCP mode on port {}", port),
                endpoint: format!("port {}", port),
            })
        } else {
            Err(AppError::AdbCommandFailed {
                cmd: format!("adb -s {} tcpip {}", serial, port),
                code: output.status_code,
                stderr: output.stderr,
            })
        }
    }

    /// Automatically discover device's local Wi-Fi IP address
    pub async fn get_device_ip(
        runner: &AdbCommandRunner,
        serial: &str,
    ) -> AppResult<Option<String>> {
        let ip_regex = match regex::Regex::new(r"(?m)(?:inet\s+|inet\s+addr:|src\s+)([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})") {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };

        // 1. Try ip -f inet addr show wlan0
        if let Ok(out) = runner
            .execute_device(serial, &["shell", "ip", "-f", "inet", "addr", "show", "wlan0"], Some(Duration::from_secs(5)))
            .await
        {
            if out.success {
                for cap in ip_regex.captures_iter(&out.stdout) {
                    if let Some(m) = cap.get(1) {
                        let ip = m.as_str().to_string();
                        if is_valid_ipv4(&ip) {
                            return Ok(Some(ip));
                        }
                    }
                }
            }
        }

        // 2. Try ip -f inet addr show (any wireless interface)
        if let Ok(out) = runner
            .execute_device(serial, &["shell", "ip", "-f", "inet", "addr", "show"], Some(Duration::from_secs(5)))
            .await
        {
            if out.success {
                for cap in ip_regex.captures_iter(&out.stdout) {
                    if let Some(m) = cap.get(1) {
                        let ip = m.as_str().to_string();
                        if is_valid_ipv4(&ip) {
                            return Ok(Some(ip));
                        }
                    }
                }
            }
        }

        // 3. Try getprop dhcp.wlan0.ipaddress
        if let Ok(out) = runner
            .execute_device(serial, &["shell", "getprop", "dhcp.wlan0.ipaddress"], Some(Duration::from_secs(5)))
            .await
        {
            if out.success {
                let ip = out.stdout.trim().to_string();
                if is_valid_ipv4(&ip) {
                    return Ok(Some(ip));
                }
            }
        }

        // 4. Try ip route
        if let Ok(out) = runner
            .execute_device(serial, &["shell", "ip", "route"], Some(Duration::from_secs(5)))
            .await
        {
            if out.success {
                for cap in ip_regex.captures_iter(&out.stdout) {
                    if let Some(m) = cap.get(1) {
                        let ip = m.as_str().to_string();
                        if is_valid_ipv4(&ip) {
                            return Ok(Some(ip));
                        }
                    }
                }
            }
        }

        // 5. Try ifconfig wlan0
        if let Ok(out) = runner
            .execute_device(serial, &["shell", "ifconfig", "wlan0"], Some(Duration::from_secs(5)))
            .await
        {
            if out.success {
                for cap in ip_regex.captures_iter(&out.stdout) {
                    if let Some(m) = cap.get(1) {
                        let ip = m.as_str().to_string();
                        if is_valid_ipv4(&ip) {
                            return Ok(Some(ip));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Complete 1-click workflow to switch USB device to Wireless ADB without official pairing
    pub async fn switch_to_wireless(
        runner: &AdbCommandRunner,
        serial: &str,
        port: u16,
        explicit_ip: Option<String>,
    ) -> AppResult<WirelessOperationResult> {
        let port = if port == 0 { 5555 } else { port };

        // 1. Resolve IP
        let target_ip = if let Some(ip) = explicit_ip.filter(|s| !s.trim().is_empty()) {
            let trimmed = ip.trim().to_string();
            if !is_valid_ipv4(&trimmed) {
                return Err(AppError::InvalidArgument(format!("'{}' is not a valid IPv4 address", trimmed)));
            }
            trimmed
        } else {
            match Self::get_device_ip(runner, serial).await? {
                Some(ip) => ip,
                None => {
                    return Err(AppError::WirelessConnectionFailed(
                        "Could not automatically detect the phone's Wi-Fi IP address. Please check Wi-Fi settings on your phone and enter the IP manually.".into(),
                    ));
                }
            }
        };

        // 2. Put ADB in TCP/IP mode on device
        let tcp_res = Self::enable_tcpip(runner, serial, port).await?;
        if !tcp_res.success {
            return Err(AppError::WirelessConnectionFailed(format!(
                "Failed to set TCP/IP mode: {}",
                tcp_res.message
            )));
        }

        // 3. Pause briefly for adbd on phone to restart in TCP mode
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // 4. Connect to device wirelessly
        let endpoint = format!("{}:{}", target_ip, port);
        let connect_res = Self::connect(runner, &target_ip, port).await;

        match connect_res {
            Ok(_) => Ok(WirelessOperationResult {
                success: true,
                message: format!(
                    "Successfully switched to Wireless ADB at {}! You can now safely unplug the USB cable.",
                    endpoint
                ),
                endpoint,
            }),
            Err(e) => Err(AppError::WirelessConnectionFailed(format!(
                "Device switched to TCP port {}, but auto-connecting to {} failed: {}. Ensure your computer and phone are connected to the same Wi-Fi network.",
                port, endpoint, e
            ))),
        }
    }

    /// Reset ADB back to USB mode
    pub async fn reset_to_usb(
        runner: &AdbCommandRunner,
        serial: &str,
    ) -> AppResult<WirelessOperationResult> {
        let output = runner
            .execute_device(serial, &["usb"], Some(Duration::from_secs(10)))
            .await?;

        if output.success {
            Ok(WirelessOperationResult {
                success: true,
                message: format!("Device {} restarted in USB mode", serial),
                endpoint: serial.to_string(),
            })
        } else {
            Err(AppError::AdbCommandFailed {
                cmd: format!("adb -s {} usb", serial),
                code: output.status_code,
                stderr: output.stderr,
            })
        }
    }
}

pub fn is_valid_ipv4(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    if ip == "127.0.0.1" || ip == "0.0.0.0" {
        return false;
    }
    parts.iter().all(|p| p.parse::<u8>().is_ok())
}
