use crate::adb::command::AdbCommandRunner;
use crate::db::history::{HistoryDb, TransferHistoryItem};
use crate::error::{AppError, AppResult};
use crate::transfer::models::{ConflictPolicy, TransferDirection, TransferJob, TransferProgress, TransferStatus};
use crate::transfer::worker::TransferWorker;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

pub struct TransferEngine {
    jobs: Arc<Mutex<Vec<TransferJob>>>,
    cancellations: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    max_concurrency: usize,
    history_db: Arc<HistoryDb>,
}

impl TransferEngine {
    pub fn new(max_concurrency: usize, history_db: Arc<HistoryDb>) -> Self {
        Self {
            jobs: Arc::new(Mutex::new(Vec::new())),
            cancellations: Arc::new(Mutex::new(HashMap::new())),
            max_concurrency,
            history_db,
        }
    }

    /// Enqueue a new transfer job
    pub fn enqueue(
        &self,
        device_serial: Option<String>,
        direction: TransferDirection,
        source_paths: Vec<String>,
        dest_dir: String,
        conflict_policy: ConflictPolicy,
    ) -> String {
        let job_id = Uuid::new_v4().to_string();
        let job = TransferJob {
            id: job_id.clone(),
            device_serial,
            direction,
            source_paths,
            dest_dir,
            conflict_policy,
            status: TransferStatus::Queued,
            current_file: None,
            transferred_bytes: 0,
            total_bytes: 0,
            speed_bps: 0.0,
            eta_secs: None,
            percentage: 0.0,
            error_message: None,
            started_at: None,
            completed_at: None,
        };

        if let Ok(mut lock) = self.jobs.lock() {
            lock.push(job);
        }

        job_id
    }

    /// Cancel a running or queued job
    pub fn cancel(&self, job_id: &str) -> AppResult<()> {
        if let Ok(cancels) = self.cancellations.lock() {
            if let Some(flag) = cancels.get(job_id) {
                flag.store(true, Ordering::Relaxed);
            }
        }

        if let Ok(mut lock) = self.jobs.lock() {
            if let Some(job) = lock.iter_mut().find(|j| j.id == job_id) {
                if job.status == TransferStatus::Queued || job.status == TransferStatus::Running {
                    job.status = TransferStatus::Cancelled;
                    job.completed_at = Some(chrono::Utc::now().timestamp_millis());
                }
            }
        }

        Ok(())
    }

    /// Retry a failed or cancelled job
    pub fn retry(&self, job_id: &str) -> AppResult<()> {
        if let Ok(mut lock) = self.jobs.lock() {
            if let Some(job) = lock.iter_mut().find(|j| j.id == job_id) {
                if job.status == TransferStatus::Failed || job.status == TransferStatus::Cancelled {
                    job.status = TransferStatus::Queued;
                    job.error_message = None;
                    job.percentage = 0.0;
                    job.transferred_bytes = 0;
                    job.started_at = None;
                    job.completed_at = None;
                }
            }
        }
        Ok(())
    }

    /// Clear completed or cancelled jobs from memory list
    pub fn clear_finished(&self) {
        if let Ok(mut lock) = self.jobs.lock() {
            lock.retain(|j| {
                j.status == TransferStatus::Queued || j.status == TransferStatus::Running
            });
        }
    }

    /// Get current list of jobs
    pub fn get_jobs(&self) -> Vec<TransferJob> {
        self.jobs.lock().map(|l| l.clone()).unwrap_or_default()
    }

    /// Process the queue in background loop
    pub fn start_worker_loop(
        self: Arc<Self>,
        runner: AdbCommandRunner,
        app_handle: AppHandle,
    ) {
        tauri::async_runtime::spawn(async move {
            let (tx, mut rx) = mpsc::unbounded_channel::<TransferProgress>();

            // Listen for progress events and broadcast them to frontend
            let app_handle_progress = app_handle.clone();
            let jobs_ref = Arc::clone(&self.jobs);
            tauri::async_runtime::spawn(async move {
                while let Some(progress) = rx.recv().await {
                    // Update in-memory job state
                    if let Ok(mut lock) = jobs_ref.lock() {
                        if let Some(job) = lock.iter_mut().find(|j| j.id == progress.job_id) {
                            job.current_file = Some(progress.current_file.clone());
                            job.percentage = progress.percentage;
                            job.speed_bps = progress.speed_bps;
                            job.eta_secs = progress.eta_secs;
                            job.transferred_bytes = progress.transferred_bytes;
                            if progress.total_bytes > 0 {
                                job.total_bytes = progress.total_bytes;
                            }
                        }
                    }

                    // Emit event to frontend
                    let _ = app_handle_progress.emit("transfer-progress", &progress);
                }
            });

            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                // Check how many jobs are currently running
                let (running_count, next_job) = {
                    let lock = self.jobs.lock().unwrap();
                    let running = lock.iter().filter(|j| j.status == TransferStatus::Running).count();
                    let next = lock
                        .iter()
                        .find(|j| j.status == TransferStatus::Queued)
                        .cloned();
                    (running, next)
                };

                if running_count < self.max_concurrency {
                    if let Some(job) = next_job {
                        // Mark as running
                        {
                            let mut lock = self.jobs.lock().unwrap();
                            if let Some(j) = lock.iter_mut().find(|j| j.id == job.id) {
                                j.status = TransferStatus::Running;
                                j.started_at = Some(chrono::Utc::now().timestamp_millis());
                            }
                        }

                        let cancel_flag = Arc::new(AtomicBool::new(false));
                        {
                            let mut cancels = self.cancellations.lock().unwrap();
                            cancels.insert(job.id.clone(), Arc::clone(&cancel_flag));
                        }

                        let engine = Arc::clone(&self);
                        let runner_clone = runner.clone();
                        let app_emit = app_handle.clone();
                        let tx_clone = tx.clone();

                        tauri::async_runtime::spawn(async move {
                            let job_id = job.id.clone();
                            let start_ts = chrono::Utc::now().timestamp_millis();
                            let res = TransferWorker::execute_job(
                                &runner_clone,
                                job.clone(),
                                tx_clone,
                                cancel_flag,
                            )
                            .await;

                            let end_ts = chrono::Utc::now().timestamp_millis();
                            let duration_secs = ((end_ts - start_ts) as f64 / 1000.0).max(0.001);

                            let final_status_str;
                            let mut error_msg = None;

                            match res {
                                Ok(completed_job) => {
                                    final_status_str = "completed".to_string();
                                    if let Ok(mut lock) = engine.jobs.lock() {
                                        if let Some(j) = lock.iter_mut().find(|j| j.id == job_id) {
                                            *j = completed_job;
                                        }
                                    }
                                }
                                Err(AppError::TransferCancelled) => {
                                    final_status_str = "cancelled".to_string();
                                    if let Ok(mut lock) = engine.jobs.lock() {
                                        if let Some(j) = lock.iter_mut().find(|j| j.id == job_id) {
                                            j.status = TransferStatus::Cancelled;
                                            j.completed_at = Some(end_ts);
                                        }
                                    }
                                }
                                Err(e) => {
                                    final_status_str = "failed".to_string();
                                    error_msg = Some(e.to_string());
                                    if let Ok(mut lock) = engine.jobs.lock() {
                                        if let Some(j) = lock.iter_mut().find(|j| j.id == job_id) {
                                            j.status = TransferStatus::Failed;
                                            j.error_message = Some(e.to_string());
                                            j.completed_at = Some(end_ts);
                                        }
                                    }
                                }
                            }

                            // Record in SQLite History
                            let history_item = TransferHistoryItem {
                                id: job_id.clone(),
                                device_serial: job.device_serial.clone(),
                                source_path: job.source_paths.join(", "),
                                dest_path: job.dest_dir.clone(),
                                direction: format!("{:?}", job.direction),
                                total_bytes: job.total_bytes,
                                status: final_status_str,
                                error_message: error_msg,
                                started_at: start_ts,
                                completed_at: end_ts,
                                duration_secs,
                            };
                            let _ = engine.history_db.record(&history_item);

                            // Clean up cancellation map
                            if let Ok(mut cancels) = engine.cancellations.lock() {
                                cancels.remove(&job_id);
                            }

                            // Emit update event
                            let all_jobs = engine.get_jobs();
                            let _ = app_emit.emit("transfer-queue-updated", &all_jobs);
                        });
                    }
                }
            }
        });
    }
}
