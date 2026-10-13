use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Error, Debug, Clone)]
pub enum AppError {
    #[error("ADB executable not found: {0}")]
    AdbNotFound(String),

    #[error("ADB command failed: {cmd} (exit: {code:?}): {stderr}")]
    AdbCommandFailed {
        cmd: String,
        code: Option<i32>,
        stderr: String,
    },

    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("Device unauthorized: {0}. Please check your phone and allow USB debugging.")]
    DeviceUnauthorized(String),

    #[error("Device offline: {0}")]
    DeviceOffline(String),

    #[error("Wireless ADB pairing failed: {0}")]
    WirelessPairingFailed(String),

    #[error("Wireless ADB connection failed: {0}")]
    WirelessConnectionFailed(String),

    #[error("Local filesystem error: {0}")]
    LocalIo(String),

    #[error("Remote path not found: {0}")]
    RemoteNotFound(String),

    #[error("Remote permission denied: {0}")]
    RemotePermissionDenied(String),

    #[error("Remote filesystem error: {0}")]
    RemoteIo(String),

    #[error("Transfer error: {0}")]
    TransferError(String),

    #[error("Transfer cancelled")]
    TransferCancelled,

    #[error("Database error: {0}")]
    Database(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Operation timed out: {0}")]
    Timeout(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
