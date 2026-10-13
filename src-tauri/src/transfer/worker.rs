use crate::adb::command::AdbCommandRunner;
use crate::error::{AppError, AppResult};
use crate::transfer::models::{TransferDirection, TransferJob, TransferProgress, TransferStatus};
use regex::Regex;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;
use walkdir::WalkDir;

pub struct TransferWorker;

impl TransferWorker {
    /// Calculate total bytes for local paths
    pub fn calculate_local_bytes(paths: &[String]) -> u64 {
        let mut total = 0u64;
        for p in paths {
            let path = Path::new(p);
            if path.is_file() {
                if let Ok(meta) = path.metadata() {
                    total += meta.len();
                }
            } else if path.is_dir() {
                for entry in WalkDir::new(path).into_iter().flatten() {
                    if entry.file_type().is_file() {
                        if let Ok(meta) = entry.metadata() {
                            total += meta.len();
                        }
                    }
                }
            }
        }
        total
    }

    /// Execute transfer job with cancellation flag and progress sender
    pub async fn execute_job(
        runner: &AdbCommandRunner,
        mut job: TransferJob,
        progress_tx: UnboundedSender<TransferProgress>,
        cancel_flag: Arc<AtomicBool>,
    ) -> AppResult<TransferJob> {
        let start_time = Instant::now();
        let now_ms = chrono::Utc::now().timestamp_millis();
        job.started_at = Some(now_ms);
        job.status = TransferStatus::Running;

        let serial_opt = job.device_serial.clone();

        match job.direction {
            TransferDirection::LocalToRemote => {
                let serial = serial_opt.ok_or_else(|| {
                    AppError::InvalidArgument("Device serial required for push".into())
                })?;
                Self::execute_push(runner, &serial, &mut job, &progress_tx, &cancel_flag, start_time).await?;
            }
            TransferDirection::RemoteToLocal => {
                let serial = serial_opt.ok_or_else(|| {
                    AppError::InvalidArgument("Device serial required for pull".into())
                })?;
                Self::execute_pull(runner, &serial, &mut job, &progress_tx, &cancel_flag, start_time).await?;
            }
            TransferDirection::RemoteToRemote => {
                let serial = serial_opt.ok_or_else(|| {
                    AppError::InvalidArgument("Device serial required for remote transfer".into())
                })?;
                Self::execute_remote_copy(runner, &serial, &mut job, &progress_tx, &cancel_flag).await?;
            }
            TransferDirection::LocalToLocal => {
                Self::execute_local_copy(&mut job, &progress_tx, &cancel_flag).await?;
            }
        }

        job.status = TransferStatus::Completed;
        job.percentage = 100.0;
        job.transferred_bytes = job.total_bytes;
        job.completed_at = Some(chrono::Utc::now().timestamp_millis());
        Ok(job)
    }

    /// Execute `adb push`
    async fn execute_push(
        runner: &AdbCommandRunner,
        serial: &str,
        job: &mut TransferJob,
        progress_tx: &UnboundedSender<TransferProgress>,
        cancel_flag: &Arc<AtomicBool>,
        start_time: Instant,
    ) -> AppResult<()> {
        let total_bytes = Self::calculate_local_bytes(&job.source_paths);
        job.total_bytes = total_bytes;

        let percent_regex = Regex::new(r#"\[\s*(\d+)%\]"#).unwrap();

        for src_str in &job.source_paths {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::TransferCancelled);
            }

            let src_path = Path::new(src_str);
            let file_name = src_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());

            job.current_file = Some(file_name.clone());

            let mut cmd = Command::new(&runner.adb_path);
            cmd.args(["-s", serial, "push", src_str, &job.dest_dir]);
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| {
                AppError::TransferError(format!("Failed to spawn adb push: {}", e))
            })?;

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let cancel_clone = Arc::clone(cancel_flag);
            let job_id = job.id.clone();
            let p_tx = progress_tx.clone();
            let current_f = file_name.clone();
            let re_clone = percent_regex.clone();

            // Task to monitor stdout & stderr lines
            let monitor_handle = tauri::async_runtime::spawn(async move {
                if let Some(out) = stdout {
                    let mut reader = BufReader::new(out).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        if cancel_clone.load(Ordering::Relaxed) {
                            break;
                        }

                        if let Some(caps) = re_clone.captures(&line) {
                            if let Ok(pct) = caps[1].parse::<f32>() {
                                let elapsed = start_time.elapsed().as_secs_f64().max(0.1);
                                let current_bytes = ((pct / 100.0) * (total_bytes as f32)) as u64;
                                let speed = current_bytes as f64 / elapsed;
                                let remaining_bytes = total_bytes.saturating_sub(current_bytes);
                                let eta = if speed > 0.0 {
                                    Some((remaining_bytes as f64 / speed) as u64)
                                } else {
                                    None
                                };

                                let _ = p_tx.send(TransferProgress {
                                    job_id: job_id.clone(),
                                    current_file: current_f.clone(),
                                    transferred_bytes: current_bytes,
                                    total_bytes,
                                    speed_bps: speed,
                                    eta_secs: eta,
                                    percentage: pct,
                                });
                            }
                        }
                    }
                }
                if let Some(err) = stderr {
                    let mut reader = BufReader::new(err).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        if cancel_clone.load(Ordering::Relaxed) {
                            break;
                        }

                        if let Some(caps) = re_clone.captures(&line) {
                            if let Ok(pct) = caps[1].parse::<f32>() {
                                let elapsed = start_time.elapsed().as_secs_f64().max(0.1);
                                let current_bytes = ((pct / 100.0) * (total_bytes as f32)) as u64;
                                let speed = current_bytes as f64 / elapsed;
                                let remaining_bytes = total_bytes.saturating_sub(current_bytes);
                                let eta = if speed > 0.0 {
                                    Some((remaining_bytes as f64 / speed) as u64)
                                } else {
                                    None
                                };

                                let _ = p_tx.send(TransferProgress {
                                    job_id: job_id.clone(),
                                    current_file: current_f.clone(),
                                    transferred_bytes: current_bytes,
                                    total_bytes,
                                    speed_bps: speed,
                                    eta_secs: eta,
                                    percentage: pct,
                                });
                            }
                        }
                    }
                }
            });

            // Wait with cancellation polling
            loop {
                if cancel_flag.load(Ordering::Relaxed) {
                    let _ = child.kill().await;
                    let _ = monitor_handle.abort();
                    return Err(AppError::TransferCancelled);
                }

                match tokio::time::timeout(Duration::from_millis(200), child.wait()).await {
                    Ok(exit_res) => {
                        let status = exit_res.map_err(|e| {
                            AppError::TransferError(format!("Process error: {}", e))
                        })?;
                        let _ = monitor_handle.await;

                        if !status.success() {
                            return Err(AppError::TransferError(format!(
                                "ADB push failed with exit code: {:?}",
                                status.code()
                            )));
                        }
                        break;
                    }
                    Err(_) => {
                        // Keep checking
                    }
                }
            }
        }

        Ok(())
    }

    /// Execute `adb pull`
    async fn execute_pull(
        runner: &AdbCommandRunner,
        serial: &str,
        job: &mut TransferJob,
        progress_tx: &UnboundedSender<TransferProgress>,
        cancel_flag: &Arc<AtomicBool>,
        _start_time: Instant,
    ) -> AppResult<()> {
        let percent_regex = Regex::new(r#"\[\s*(\d+)%\]"#).unwrap();

        for src_str in &job.source_paths {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::TransferCancelled);
            }

            let file_name = src_str
                .rsplit('/')
                .next()
                .unwrap_or(src_str)
                .to_string();

            job.current_file = Some(file_name.clone());

            let mut cmd = Command::new(&runner.adb_path);
            cmd.args(["-s", serial, "pull", src_str, &job.dest_dir]);
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| {
                AppError::TransferError(format!("Failed to spawn adb pull: {}", e))
            })?;

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let cancel_clone = Arc::clone(cancel_flag);
            let job_id = job.id.clone();
            let p_tx = progress_tx.clone();
            let current_f = file_name.clone();
            let re_clone = percent_regex.clone();

            let monitor_handle = tauri::async_runtime::spawn(async move {
                if let Some(out) = stdout {
                    let mut reader = BufReader::new(out).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        if cancel_clone.load(Ordering::Relaxed) {
                            break;
                        }

                        if let Some(caps) = re_clone.captures(&line) {
                            if let Ok(pct) = caps[1].parse::<f32>() {
                                let speed = 1024.0 * 1024.0;

                                let _ = p_tx.send(TransferProgress {
                                    job_id: job_id.clone(),
                                    current_file: current_f.clone(),
                                    transferred_bytes: 0,
                                    total_bytes: 0,
                                    speed_bps: speed,
                                    eta_secs: None,
                                    percentage: pct,
                                });
                            }
                        }
                    }
                }
                if let Some(err) = stderr {
                    let mut reader = BufReader::new(err).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        if cancel_clone.load(Ordering::Relaxed) {
                            break;
                        }

                        if let Some(caps) = re_clone.captures(&line) {
                            if let Ok(pct) = caps[1].parse::<f32>() {
                                let speed = 1024.0 * 1024.0;

                                let _ = p_tx.send(TransferProgress {
                                    job_id: job_id.clone(),
                                    current_file: current_f.clone(),
                                    transferred_bytes: 0,
                                    total_bytes: 0,
                                    speed_bps: speed,
                                    eta_secs: None,
                                    percentage: pct,
                                });
                            }
                        }
                    }
                }
            });

            loop {
                if cancel_flag.load(Ordering::Relaxed) {
                    let _ = child.kill().await;
                    let _ = monitor_handle.abort();
                    return Err(AppError::TransferCancelled);
                }

                match tokio::time::timeout(Duration::from_millis(200), child.wait()).await {
                    Ok(exit_res) => {
                        let status = exit_res.map_err(|e| {
                            AppError::TransferError(format!("Process error: {}", e))
                        })?;
                        let _ = monitor_handle.await;

                        if !status.success() {
                            return Err(AppError::TransferError(format!(
                                "ADB pull failed with exit code: {:?}",
                                status.code()
                            )));
                        }
                        break;
                    }
                    Err(_) => {}
                }
            }
        }

        Ok(())
    }

    /// Remote to Remote copy
    async fn execute_remote_copy(
        runner: &AdbCommandRunner,
        serial: &str,
        job: &mut TransferJob,
        progress_tx: &UnboundedSender<TransferProgress>,
        cancel_flag: &Arc<AtomicBool>,
    ) -> AppResult<()> {
        let dest = AdbCommandRunner::escape_shell_arg(&job.dest_dir);
        let count = job.source_paths.len().max(1);

        for (idx, src) in job.source_paths.iter().enumerate() {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::TransferCancelled);
            }

            let escaped_src = AdbCommandRunner::escape_shell_arg(src);
            let cmd = format!("cp -r {} {}", escaped_src, dest);
            let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(30))).await?;

            if !output.success {
                return Err(AppError::RemoteIo(format!(
                    "Remote copy failed: {}",
                    output.stderr
                )));
            }

            let pct = ((idx + 1) as f32 / count as f32) * 100.0;
            let _ = progress_tx.send(TransferProgress {
                job_id: job.id.clone(),
                current_file: src.clone(),
                transferred_bytes: idx as u64,
                total_bytes: count as u64,
                speed_bps: 0.0,
                eta_secs: None,
                percentage: pct,
            });
        }

        Ok(())
    }

    /// Local to Local copy
    async fn execute_local_copy(
        job: &mut TransferJob,
        progress_tx: &UnboundedSender<TransferProgress>,
        cancel_flag: &Arc<AtomicBool>,
    ) -> AppResult<()> {
        let dest_dir = Path::new(&job.dest_dir);
        let count = job.source_paths.len().max(1);

        for (idx, src_str) in job.source_paths.iter().enumerate() {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::TransferCancelled);
            }

            let src = Path::new(src_str);
            let file_name = src.file_name().ok_or_else(|| {
                AppError::LocalIo(format!("Invalid path: {}", src_str))
            })?;
            let dest_file = dest_dir.join(file_name);

            if src.is_dir() {
                crate::fs::local::LocalFsService::copy_items(&[src_str.clone()], &job.dest_dir)?;
            } else {
                std::fs::copy(src, &dest_file).map_err(|e| {
                    AppError::LocalIo(format!("Failed to copy {}: {}", src_str, e))
                })?;
            }

            let pct = ((idx + 1) as f32 / count as f32) * 100.0;
            let _ = progress_tx.send(TransferProgress {
                job_id: job.id.clone(),
                current_file: src_str.clone(),
                transferred_bytes: idx as u64,
                total_bytes: count as u64,
                speed_bps: 0.0,
                eta_secs: None,
                percentage: pct,
            });
        }

        Ok(())
    }
}
