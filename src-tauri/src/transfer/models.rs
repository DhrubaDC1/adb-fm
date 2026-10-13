use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferDirection {
    LocalToRemote,
    RemoteToLocal,
    RemoteToRemote,
    LocalToLocal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    Ask,
    Overwrite,
    Skip,
    Rename,
    Cancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub job_id: String,
    pub current_file: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: f64,
    pub eta_secs: Option<u64>,
    pub percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferJob {
    pub id: String,
    pub device_serial: Option<String>,
    pub direction: TransferDirection,
    pub source_paths: Vec<String>,
    pub dest_dir: String,
    pub conflict_policy: ConflictPolicy,
    pub status: TransferStatus,
    pub current_file: Option<String>,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: f64,
    pub eta_secs: Option<u64>,
    pub percentage: f32,
    pub error_message: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}
