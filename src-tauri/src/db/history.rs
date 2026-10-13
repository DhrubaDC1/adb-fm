use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferHistoryItem {
    pub id: String,
    pub device_serial: Option<String>,
    pub source_path: String,
    pub dest_path: String,
    pub direction: String,
    pub total_bytes: u64,
    pub status: String,
    pub error_message: Option<String>,
    pub started_at: i64,
    pub completed_at: i64,
    pub duration_secs: f64,
}

pub struct HistoryDb {
    conn: Mutex<Connection>,
}

impl HistoryDb {
    pub fn new<P: AsRef<Path>>(path: P) -> AppResult<Self> {
        let conn = Connection::open(path).map_err(|e| AppError::Database(e.to_string()))?;

        // Initialize schema
        conn.execute(
            "CREATE TABLE IF NOT EXISTS transfer_history (
                id TEXT PRIMARY KEY,
                device_serial TEXT,
                source_path TEXT NOT NULL,
                dest_path TEXT NOT NULL,
                direction TEXT NOT NULL,
                total_bytes INTEGER NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT,
                started_at INTEGER NOT NULL,
                completed_at INTEGER NOT NULL,
                duration_secs REAL NOT NULL
            )",
            [],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn default_path() -> PathBuf {
        let mut dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        dir.push("droidbridge");
        let _ = std::fs::create_dir_all(&dir);
        dir.push("history.db");
        dir
    }

    pub fn record(&self, item: &TransferHistoryItem) -> AppResult<()> {
        let conn = self.conn.lock().map_err(|_| AppError::Database("Lock poisoned".into()))?;
        conn.execute(
            "INSERT INTO transfer_history (
                id, device_serial, source_path, dest_path, direction,
                total_bytes, status, error_message, started_at, completed_at, duration_secs
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                item.id,
                item.device_serial,
                item.source_path,
                item.dest_path,
                item.direction,
                item.total_bytes as i64,
                item.status,
                item.error_message,
                item.started_at,
                item.completed_at,
                item.duration_secs,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(())
    }

    pub fn get_history(&self, limit: usize, offset: usize) -> AppResult<Vec<TransferHistoryItem>> {
        let conn = self.conn.lock().map_err(|_| AppError::Database("Lock poisoned".into()))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, device_serial, source_path, dest_path, direction,
                        total_bytes, status, error_message, started_at, completed_at, duration_secs
                 FROM transfer_history
                 ORDER BY completed_at DESC
                 LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64, offset as i64], |row| {
                Ok(TransferHistoryItem {
                    id: row.get(0)?,
                    device_serial: row.get(1)?,
                    source_path: row.get(2)?,
                    dest_path: row.get(3)?,
                    direction: row.get(4)?,
                    total_bytes: row.get::<_, i64>(5)? as u64,
                    status: row.get(6)?,
                    error_message: row.get(7)?,
                    started_at: row.get(8)?,
                    completed_at: row.get(9)?,
                    duration_secs: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut items = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                items.push(item);
            }
        }

        Ok(items)
    }

    pub fn clear_history(&self) -> AppResult<()> {
        let conn = self.conn.lock().map_err(|_| AppError::Database("Lock poisoned".into()))?;
        conn.execute("DELETE FROM transfer_history", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }
}
