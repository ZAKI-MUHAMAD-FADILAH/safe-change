#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

mod path_guard;

#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[napi]
pub fn check_path_boundary(path: String, root: String) -> bool {
    path_guard::check_path_boundary(&path, &root)
}

#[napi]
pub fn resolve_and_check_boundary(path: String, root: String) -> Option<bool> {
    path_guard::resolve_and_check_boundary(&path, &root).ok()
}

#[napi]
pub fn is_symlink_or_junction(path: String) -> Option<bool> {
    path_guard::is_symlink_or_junction(&path).ok()
}

#[napi]
pub fn atomic_write_file(staging_path: String, target_path: String) -> bool {
    path_guard::atomic_write_file(&staging_path, &target_path).is_ok()
}

#[napi]
pub fn lock_file(path: String) -> Option<f64> {
    path_guard::lock_file(&path).ok().map(|handle| handle as f64)
}

#[napi]
pub fn unlock_file(handle: f64) -> bool {
    path_guard::unlock_file(handle as u64).is_ok()
}
