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
