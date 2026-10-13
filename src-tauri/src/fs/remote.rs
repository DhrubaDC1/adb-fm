use crate::adb::command::AdbCommandRunner;
use crate::error::{AppError, AppResult};
use crate::fs::local::FileEntry;
use chrono::NaiveDateTime;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteShortcut {
    pub name: String,
    pub path: String,
    pub icon: String,
}

pub struct RemoteFsService;

impl RemoteFsService {
    /// Return standard Android shortcuts for quick navigation
    pub fn get_shortcuts() -> Vec<RemoteShortcut> {
        vec![
            RemoteShortcut {
                name: "Internal Storage".into(),
                path: "/sdcard".into(),
                icon: "smartphone".into(),
            },
            RemoteShortcut {
                name: "Downloads".into(),
                path: "/sdcard/Download".into(),
                icon: "download".into(),
            },
            RemoteShortcut {
                name: "DCIM / Camera".into(),
                path: "/sdcard/DCIM".into(),
                icon: "camera".into(),
            },
            RemoteShortcut {
                name: "Pictures".into(),
                path: "/sdcard/Pictures".into(),
                icon: "image".into(),
            },
            RemoteShortcut {
                name: "Documents".into(),
                path: "/sdcard/Documents".into(),
                icon: "file-text".into(),
            },
            RemoteShortcut {
                name: "Music".into(),
                path: "/sdcard/Music".into(),
                icon: "music".into(),
            },
            RemoteShortcut {
                name: "Movies".into(),
                path: "/sdcard/Movies".into(),
                icon: "film".into(),
            },
            RemoteShortcut {
                name: "Android Media".into(),
                path: "/sdcard/Android/media".into(),
                icon: "folder".into(),
            },
        ]
    }

    /// Parse Unix/Toybox `ls -la` output into FileEntry items
    pub fn parse_remote_ls_output(
        output: &str,
        base_path: &str,
        show_hidden: bool,
    ) -> (Vec<FileEntry>, Vec<String>) {
        let mut entries = Vec::new();
        let mut warnings = Vec::new();

        // Pattern handles Toybox/Linux ls formats:
        // Group 1: Permissions (e.g. -rw-r--r--, drwxr-xr-x, lrwxrwxrwx)
        // Group 2: Hardlinks / count (optional)
        // Group 3: Owner (e.g. u0_a123, root, 0)
        // Group 4: Group (e.g. sdcard_rw, root, 1015)
        // Group 5: Size in bytes
        // Group 6: Date & Time (e.g. 2026-03-01 12:00, or Jan 15 12:00, or 2026-03-01 12:00:00)
        // Group 7: Name (and optional -> target)
        let re = Regex::new(
            r#"^([bcdlpsw-][rwxstST-]{9})\s+(?:\d+\s+)?(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?|\w{3}\s+\d+\s+(?:\d{4}|\d{2}:\d{2}))\s+(.*)$"#
        ).expect("Valid regex");

        let normalized_base = base_path.trim_end_matches('/');

        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("total ") {
                continue;
            }

            // Check for permission denied or errors
            if trimmed.contains("Permission denied") {
                warnings.push(trimmed.to_string());
                continue;
            }
            if trimmed.contains("No such file or directory") {
                warnings.push(trimmed.to_string());
                continue;
            }

            if let Some(caps) = re.captures(trimmed) {
                let perms = &caps[1];
                let size: u64 = caps[4].parse().unwrap_or(0);
                let date_str = &caps[5];
                let raw_name = &caps[6];

                let is_symlink = perms.starts_with('l');
                let is_dir_by_perm = perms.starts_with('d');

                let (name, symlink_target) = if is_symlink && raw_name.contains(" -> ") {
                    let parts: Vec<&str> = raw_name.splitn(2, " -> ").collect();
                    (parts[0].trim().to_string(), Some(parts[1].trim().to_string()))
                } else {
                    (raw_name.trim().to_string(), None)
                };

                // Skip special pointers
                if name == "." || name == ".." {
                    continue;
                }

                let is_hidden = name.starts_with('.');
                if !show_hidden && is_hidden {
                    continue;
                }

                // If it's a symlink pointing to a dir like /storage/emulated/0, mark as dir
                let is_dir = is_dir_by_perm
                    || (is_symlink
                        && (name == "sdcard"
                            || symlink_target.as_deref().map(|t| t.contains("storage") || t.ends_with('/')).unwrap_or(false)));

                // Parse date if possible
                let modified_ms = Self::parse_date_to_ms(date_str);

                let full_path = if normalized_base.is_empty() {
                    format!("/{}", name)
                } else {
                    format!("{}/{}", normalized_base, name)
                };

                entries.push(FileEntry {
                    name,
                    path: full_path,
                    is_dir,
                    is_symlink,
                    symlink_target,
                    size: if is_dir { 0 } else { size },
                    modified_ms,
                    permissions: Some(perms.to_string()),
                    is_hidden,
                });
            } else {
                // Fallback: If line doesn't match standard full regex, check if it's a simple line
                // or contains spaces
                if !trimmed.starts_with('*') && !trimmed.starts_with("ls:") {
                    // It could be a simple entry line
                    let name = trimmed.to_string();
                    if name != "." && name != ".." {
                        let is_hidden = name.starts_with('.');
                        if show_hidden || !is_hidden {
                            let full_path = if normalized_base.is_empty() {
                                format!("/{}", name)
                            } else {
                                format!("{}/{}", normalized_base, name)
                            };
                            entries.push(FileEntry {
                                name,
                                path: full_path,
                                is_dir: false,
                                is_symlink: false,
                                symlink_target: None,
                                size: 0,
                                modified_ms: None,
                                permissions: None,
                                is_hidden,
                            });
                        }
                    }
                }
            }
        }

        // Sort folders first, then alphabetically
        entries.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        (entries, warnings)
    }

    fn parse_date_to_ms(date_str: &str) -> Option<i64> {
        // e.g. "2026-03-01 12:00" or "2026-03-01 12:00:00"
        if let Ok(dt) = NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S") {
            return Some(dt.and_utc().timestamp_millis());
        }
        if let Ok(dt) = NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M") {
            return Some(dt.and_utc().timestamp_millis());
        }
        None
    }

    /// List contents of a remote directory on Android
    pub async fn list_directory(
        runner: &AdbCommandRunner,
        serial: &str,
        path: &str,
        show_hidden: bool,
    ) -> AppResult<Vec<FileEntry>> {
        let clean_path = if path.trim().is_empty() { "/sdcard" } else { path.trim() };
        let escaped_path = AdbCommandRunner::escape_shell_arg(clean_path);

        // Run `ls -la` inside the directory
        let cmd = format!("ls -la {}", escaped_path);
        let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(12))).await?;

        if !output.success && output.stdout.is_empty() {
            if output.stderr.contains("Permission denied") {
                return Err(AppError::RemotePermissionDenied(format!(
                    "Permission denied to access remote path: {}",
                    clean_path
                )));
            } else if output.stderr.contains("No such file") {
                return Err(AppError::RemoteNotFound(format!(
                    "Remote path does not exist: {}",
                    clean_path
                )));
            }
            return Err(AppError::RemoteIo(output.stderr));
        }

        let (entries, warnings) = Self::parse_remote_ls_output(&output.stdout, clean_path, show_hidden);

        if entries.is_empty() && !warnings.is_empty() {
            let combined_warning = warnings.join("; ");
            if combined_warning.contains("Permission denied") {
                return Err(AppError::RemotePermissionDenied(format!(
                    "Cannot read {}: {}",
                    clean_path, combined_warning
                )));
            }
        }

        Ok(entries)
    }

    /// Create remote directory: `mkdir -p '<path>'`
    pub async fn create_directory(
        runner: &AdbCommandRunner,
        serial: &str,
        path: &str,
    ) -> AppResult<()> {
        let escaped = AdbCommandRunner::escape_shell_arg(path);
        let cmd = format!("mkdir -p {}", escaped);
        let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(10))).await?;

        if output.success {
            Ok(())
        } else {
            Err(AppError::RemoteIo(format!(
                "Failed to create directory {}: {}",
                path, output.stderr
            )))
        }
    }

    /// Rename remote file or directory: `mv '<old>' '<new>'`
    pub async fn rename_item(
        runner: &AdbCommandRunner,
        serial: &str,
        old_path: &str,
        new_path: &str,
    ) -> AppResult<()> {
        let escaped_old = AdbCommandRunner::escape_shell_arg(old_path);
        let escaped_new = AdbCommandRunner::escape_shell_arg(new_path);
        let cmd = format!("mv {} {}", escaped_old, escaped_new);
        let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(10))).await?;

        if output.success {
            Ok(())
        } else {
            Err(AppError::RemoteIo(format!(
                "Failed to rename {} to {}: {}",
                old_path, new_path, output.stderr
            )))
        }
    }

    /// Delete remote items: `rm -rf '<path>'`
    pub async fn delete_items(
        runner: &AdbCommandRunner,
        serial: &str,
        paths: &[String],
    ) -> AppResult<()> {
        for path in paths {
            let escaped = AdbCommandRunner::escape_shell_arg(path);
            let cmd = format!("rm -rf {}", escaped);
            let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(15))).await?;
            if !output.success {
                return Err(AppError::RemoteIo(format!(
                    "Failed to delete {}: {}",
                    path, output.stderr
                )));
            }
        }
        Ok(())
    }

    /// Copy remote items within Android: `cp -r '<src>' '<dest>'`
    pub async fn copy_items(
        runner: &AdbCommandRunner,
        serial: &str,
        sources: &[String],
        dest_dir: &str,
    ) -> AppResult<()> {
        let escaped_dest = AdbCommandRunner::escape_shell_arg(dest_dir);
        for src in sources {
            let escaped_src = AdbCommandRunner::escape_shell_arg(src);
            let cmd = format!("cp -r {} {}", escaped_src, escaped_dest);
            let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(20))).await?;
            if !output.success {
                return Err(AppError::RemoteIo(format!(
                    "Failed to copy {} to {}: {}",
                    src, dest_dir, output.stderr
                )));
            }
        }
        Ok(())
    }

    /// Move remote items within Android: `mv '<src>' '<dest>'`
    pub async fn move_items(
        runner: &AdbCommandRunner,
        serial: &str,
        sources: &[String],
        dest_dir: &str,
    ) -> AppResult<()> {
        let escaped_dest = AdbCommandRunner::escape_shell_arg(dest_dir);
        for src in sources {
            let escaped_src = AdbCommandRunner::escape_shell_arg(src);
            let cmd = format!("mv {} {}", escaped_src, escaped_dest);
            let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(15))).await?;
            if !output.success {
                return Err(AppError::RemoteIo(format!(
                    "Failed to move {} to {}: {}",
                    src, dest_dir, output.stderr
                )));
            }
        }
        Ok(())
    }

    /// Search files on Android device
    pub async fn search(
        runner: &AdbCommandRunner,
        serial: &str,
        base_path: &str,
        query: &str,
        recursive: bool,
        max_results: usize,
    ) -> AppResult<Vec<FileEntry>> {
        let escaped_base = AdbCommandRunner::escape_shell_arg(base_path);
        let escaped_name = AdbCommandRunner::escape_shell_arg(&format!("*{}*", query.trim()));
        let depth_arg = if recursive { "-maxdepth 4" } else { "-maxdepth 1" };

        let cmd = format!("find {} {} -iname {} 2>/dev/null | head -n {}", escaped_base, depth_arg, escaped_name, max_results);
        let output = runner.execute_shell(serial, &cmd, Some(Duration::from_secs(15))).await?;

        let mut entries = Vec::new();
        for line in output.stdout.lines() {
            let path = line.trim();
            if path.is_empty() {
                continue;
            }
            let name = path.rsplit('/').next().unwrap_or(path).to_string();
            entries.push(FileEntry {
                name,
                path: path.to_string(),
                is_dir: false,
                is_symlink: false,
                symlink_target: None,
                size: 0,
                modified_ms: None,
                permissions: None,
                is_hidden: false,
            });
        }

        Ok(entries)
    }
}
