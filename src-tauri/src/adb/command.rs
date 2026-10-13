use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct AdbCommandRunner {
    pub adb_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub status_code: Option<i32>,
    pub success: bool,
}

impl AdbCommandRunner {
    pub fn new<P: AsRef<Path>>(adb_path: P) -> Self {
        Self {
            adb_path: adb_path.as_ref().to_path_buf(),
        }
    }

    /// Execute an ADB command with arguments, without invoking a local shell.
    pub async fn execute(&self, args: &[&str], timeout_dur: Option<Duration>) -> AppResult<CommandOutput> {
        let dur = timeout_dur.unwrap_or(Duration::from_secs(30));

        let mut cmd = Command::new(&self.adb_path);
        cmd.args(args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                return Err(AppError::AdbNotFound(format!(
                    "Failed to spawn ADB binary at {:?}: {}",
                    self.adb_path, e
                )));
            }
        };

        let result = timeout(dur, async {
            let mut stdout_buf = Vec::new();
            let mut stderr_buf = Vec::new();

            if let Some(mut stdout) = child.stdout.take() {
                let _ = stdout.read_to_end(&mut stdout_buf).await;
            }
            if let Some(mut stderr) = child.stderr.take() {
                let _ = stderr.read_to_end(&mut stderr_buf).await;
            }

            let status = child.wait().await;
            (status, stdout_buf, stderr_buf)
        })
        .await;

        match result {
            Ok((Ok(status), stdout_bytes, stderr_bytes)) => {
                let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
                let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();
                let status_code = status.code();
                let success = status.success();

                Ok(CommandOutput {
                    stdout,
                    stderr,
                    status_code,
                    success,
                })
            }
            Ok((Err(e), _, _)) => Err(AppError::AdbCommandFailed {
                cmd: format!("{:?} {:?}", self.adb_path, args),
                code: None,
                stderr: e.to_string(),
            }),
            Err(_) => {
                // Kill timed out child
                let _ = child.kill().await;
                Err(AppError::Timeout(format!(
                    "Command {:?} {:?} timed out after {}s",
                    self.adb_path,
                    args,
                    dur.as_secs()
                )))
            }
        }
    }

    /// Execute a command targeted to a specific device serial
    pub async fn execute_device(
        &self,
        serial: &str,
        args: &[&str],
        timeout_dur: Option<Duration>,
    ) -> AppResult<CommandOutput> {
        let mut full_args = vec!["-s", serial];
        full_args.extend_from_slice(args);
        self.execute(&full_args, timeout_dur).await
    }

    /// Safely escape a string for passing into remote sh / toybox shell on Android
    pub fn escape_shell_arg(arg: &str) -> String {
        // Enclose in single quotes and replace each ' with '\''
        if arg.is_empty() {
            return "''".to_string();
        }
        format!("'{}'", arg.replace('\'', "'\\''"))
    }

    /// Execute a remote shell command on the device with properly escaped arguments
    pub async fn execute_shell(
        &self,
        serial: &str,
        shell_cmd: &str,
        timeout_dur: Option<Duration>,
    ) -> AppResult<CommandOutput> {
        self.execute_device(serial, &["shell", shell_cmd], timeout_dur).await
    }
}
