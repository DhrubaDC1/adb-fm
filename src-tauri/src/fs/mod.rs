pub mod local;
pub mod remote;

pub use local::{FileEntry, LocalFsService, StandardPaths};
pub use remote::{RemoteFsService, RemoteShortcut};
