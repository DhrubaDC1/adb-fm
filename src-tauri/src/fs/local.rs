use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub size: u64,
    pub modified_ms: Option<i64>,
    pub permissions: Option<String>,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StandardPaths {
    pub home: String,
    pub desktop: Option<String>,
    pub documents: Option<String>,
    pub downloads: Option<String>,
    pub pictures: Option<String>,
    pub music: Option<String>,
    pub videos: Option<String>,
}

pub struct LocalFsService;

impl LocalFsService {
    /// Get standard desktop paths for quick navigation
    pub fn get_standard_paths() -> StandardPaths {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        StandardPaths {
            home: home.to_string_lossy().to_string(),
            desktop: dirs::desktop_dir().map(|p| p.to_string_lossy().to_string()),
            documents: dirs::document_dir().map(|p| p.to_string_lossy().to_string()),
            downloads: dirs::download_dir().map(|p| p.to_string_lossy().to_string()),
            pictures: dirs::picture_dir().map(|p| p.to_string_lossy().to_string()),
            music: dirs::audio_dir().map(|p| p.to_string_lossy().to_string()),
            videos: dirs::video_dir().map(|p| p.to_string_lossy().to_string()),
        }
    }

    /// List entries in a local directory
    pub fn list_directory(dir_path: &str, show_hidden: bool) -> AppResult<Vec<FileEntry>> {
        let path = Path::new(dir_path);
        if !path.exists() {
            return Err(AppError::LocalIo(format!("Path does not exist: {}", dir_path)));
        }
        if !path.is_dir() {
            return Err(AppError::LocalIo(format!("Path is not a directory: {}", dir_path)));
        }

        let read_dir = fs::read_dir(path)
            .map_err(|e| AppError::LocalIo(format!("Cannot read directory {}: {}", dir_path, e)))?;

        let mut entries = Vec::new();

        for entry in read_dir.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_hidden = file_name.starts_with('.');

            if !show_hidden && is_hidden {
                continue;
            }

            let entry_path = entry.path();
            let metadata = entry.metadata().ok();
            let file_type = entry.file_type().ok();
            let is_symlink = file_type.as_ref().map(|ft| ft.is_symlink()).unwrap_or(false);

            let symlink_target = if is_symlink {
                fs::read_link(&entry_path)
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            let is_dir = metadata
                .as_ref()
                .map(|m| m.is_dir())
                .unwrap_or_else(|| entry_path.is_dir());

            let size = if is_dir {
                0
            } else {
                metadata.as_ref().map(|m| m.len()).unwrap_or(0)
            };

            let modified_ms = metadata
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);

            entries.push(FileEntry {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir,
                is_symlink,
                symlink_target,
                size,
                modified_ms,
                permissions: None,
                is_hidden,
            });
        }

        // Sort folders first, then alphabetically
        entries.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        Ok(entries)
    }

    /// Create local directory
    pub fn create_directory(dir_path: &str) -> AppResult<()> {
        let path = Path::new(dir_path);
        fs::create_dir_all(path)
            .map_err(|e| AppError::LocalIo(format!("Failed to create directory {}: {}", dir_path, e)))
    }

    /// Rename local file or directory
    pub fn rename_item(old_path: &str, new_path: &str) -> AppResult<()> {
        fs::rename(old_path, new_path)
            .map_err(|e| AppError::LocalIo(format!("Failed to rename {} to {}: {}", old_path, new_path, e)))
    }

    /// Delete local items (files or directories recursively)
    pub fn delete_items(paths: &[String]) -> AppResult<()> {
        for p_str in paths {
            let path = Path::new(p_str);
            if !path.exists() {
                continue;
            }
            if path.is_dir() {
                fs::remove_dir_all(path).map_err(|e| {
                    AppError::LocalIo(format!("Failed to remove directory {}: {}", p_str, e))
                })?;
            } else {
                fs::remove_file(path).map_err(|e| {
                    AppError::LocalIo(format!("Failed to remove file {}: {}", p_str, e))
                })?;
            }
        }
        Ok(())
    }

    /// Copy local items into destination directory
    pub fn copy_items(sources: &[String], dest_dir: &str) -> AppResult<()> {
        let dest = Path::new(dest_dir);
        if !dest.is_dir() {
            return Err(AppError::LocalIo(format!("Destination {} is not a directory", dest_dir)));
        }

        for src_str in sources {
            let src = Path::new(src_str);
            if !src.exists() {
                continue;
            }
            let file_name = src.file_name().ok_or_else(|| {
                AppError::LocalIo(format!("Invalid source path {}", src_str))
            })?;
            let target = dest.join(file_name);

            if src.is_dir() {
                Self::copy_dir_recursive(src, &target)?;
            } else {
                fs::copy(src, &target).map_err(|e| {
                    AppError::LocalIo(format!("Failed to copy {} to {:?}: {}", src_str, target, e))
                })?;
            }
        }
        Ok(())
    }

    fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
        fs::create_dir_all(dst).map_err(|e| {
            AppError::LocalIo(format!("Failed to create directory {:?}: {}", dst, e))
        })?;

        for entry in fs::read_dir(src).map_err(|e| {
            AppError::LocalIo(format!("Failed to read directory {:?}: {}", src, e))
        })? {
            let entry = entry.map_err(|e| AppError::LocalIo(e.to_string()))?;
            let entry_path = entry.path();
            let dest_path = dst.join(entry.file_name());

            if entry_path.is_dir() {
                Self::copy_dir_recursive(&entry_path, &dest_path)?;
            } else {
                fs::copy(&entry_path, &dest_path).map_err(|e| {
                    AppError::LocalIo(format!("Failed to copy {:?} to {:?}: {}", entry_path, dest_path, e))
                })?;
            }
        }
        Ok(())
    }

    /// Move local items into destination directory
    pub fn move_items(sources: &[String], dest_dir: &str) -> AppResult<()> {
        let dest = Path::new(dest_dir);
        if !dest.is_dir() {
            return Err(AppError::LocalIo(format!("Destination {} is not a directory", dest_dir)));
        }

        for src_str in sources {
            let src = Path::new(src_str);
            if !src.exists() {
                continue;
            }
            let file_name = src.file_name().ok_or_else(|| {
                AppError::LocalIo(format!("Invalid source path {}", src_str))
            })?;
            let target = dest.join(file_name);
            fs::rename(src, &target).map_err(|e| {
                AppError::LocalIo(format!("Failed to move {} to {:?}: {}", src_str, target, e))
            })?;
        }
        Ok(())
    }
}
