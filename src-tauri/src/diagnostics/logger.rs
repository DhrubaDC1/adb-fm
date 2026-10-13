use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticLogEntry {
    pub timestamp: String,
    pub level: String, // "INFO", "WARN", "ERROR", "DEBUG"
    pub category: String, // "ADB", "TRANSFER", "FS", "APP"
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDiagnosticsReport {
    pub os: String,
    pub arch: String,
    pub adb_path: String,
    pub adb_version: String,
    pub logs: Vec<DiagnosticLogEntry>,
}

pub struct DiagnosticLogger {
    logs: Mutex<VecDeque<DiagnosticLogEntry>>,
    max_entries: usize,
}

impl DiagnosticLogger {
    pub fn new(max_entries: usize) -> Self {
        Self {
            logs: Mutex::new(VecDeque::with_capacity(max_entries)),
            max_entries,
        }
    }

    pub fn log(&self, level: &str, category: &str, message: &str) {
        let redacted = Self::redact_sensitive(message);
        let now: DateTime<Utc> = Utc::now();
        let entry = DiagnosticLogEntry {
            timestamp: now.to_rfc3339(),
            level: level.to_uppercase(),
            category: category.to_uppercase(),
            message: redacted,
        };

        if let Ok(mut lock) = self.logs.lock() {
            if lock.len() >= self.max_entries {
                lock.pop_front();
            }
            lock.push_back(entry);
        }
    }

    pub fn info(&self, category: &str, message: &str) {
        self.log("INFO", category, message);
    }

    pub fn warn(&self, category: &str, message: &str) {
        self.log("WARN", category, message);
    }

    pub fn error(&self, category: &str, message: &str) {
        self.log("ERROR", category, message);
    }

    pub fn get_logs(&self) -> Vec<DiagnosticLogEntry> {
        self.logs.lock().map(|l| l.iter().cloned().collect()).unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut lock) = self.logs.lock() {
            lock.clear();
        }
    }

    pub fn export_report(&self, adb_path: &str, adb_ver: &str) -> SystemDiagnosticsReport {
        SystemDiagnosticsReport {
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            adb_path: adb_path.to_string(),
            adb_version: adb_ver.to_string(),
            logs: self.get_logs(),
        }
    }

    fn redact_sensitive(input: &str) -> String {
        // Redact any obvious pairing codes (6 digit numbers in pairing contexts)
        let re_pair = regex::Regex::new(r#"(?i)(pair(?:ing)?(?:\s+code|\s+)?[:=]?\s*)\d{6}"#).unwrap();
        re_pair.replace_all(input, "$1******").to_string()
    }
}
