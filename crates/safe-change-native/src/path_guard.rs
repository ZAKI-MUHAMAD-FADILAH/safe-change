use std::fs;
use std::path::Path;

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

/// Basic boundary check without canonicalization (Milestone R.1 backwards compatibility).
pub fn check_path_boundary(path_str: &str, root_str: &str) -> bool {
    let path = Path::new(path_str);
    let root = Path::new(root_str);

    if !path.is_absolute() || !root.is_absolute() {
        return false;
    }

    path.starts_with(root)
}

/// Resolves real target path and root boundary using filesystem canonicalization.
/// Resolves all intermediate symbolic links before checking boundary containment.
pub fn resolve_and_check_boundary(path_str: &str, root_str: &str) -> Result<bool, String> {
    let path = Path::new(path_str);
    let root = Path::new(root_str);

    let canonical_path = fs::canonicalize(path)
        .map_err(|e| format!("Cannot resolve target path: {}", e))?;
    let canonical_root = fs::canonicalize(root)
        .map_err(|e| format!("Cannot resolve boundary root: {}", e))?;

    Ok(canonical_path.starts_with(&canonical_root))
}

/// Detects whether target path is a symbolic link or NTFS junction point.
pub fn is_symlink_or_junction(path_str: &str) -> Result<bool, String> {
    let meta = fs::symlink_metadata(path_str)
        .map_err(|e| format!("Cannot read file metadata: {}", e))?;

    if meta.file_type().is_symlink() {
        return Ok(true);
    }

    #[cfg(windows)]
    {
        // 0x00000400 is FILE_ATTRIBUTE_REPARSE_POINT (NTFS junction, symlink, or mount point)
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x00000400;
        if (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Performs an atomic rename of staging_path to target_path with kernel-level guarantees.
/// Verifies that neither source nor target are symbolic links or junction points before swapping.
pub fn atomic_write_file(staging_path: &str, target_path: &str) -> Result<(), String> {
    // 1. Verify staging path exists and is not a symlink/junction
    if is_symlink_or_junction(staging_path)? {
        return Err("Staging path cannot be a symbolic link or junction point".to_string());
    }

    // 2. If target path already exists, ensure it is not a symlink/junction
    if Path::new(target_path).exists() && is_symlink_or_junction(target_path)? {
        return Err("Target path cannot be a symbolic link or junction point".to_string());
    }

    // 3. Platform-specific atomic rename
    #[cfg(unix)]
    {
        fs::rename(staging_path, target_path)
            .map_err(|e| format!("POSIX atomic rename failed: {}", e))?;
        Ok(())
    }

    #[cfg(windows)]
    {
        let wide_staging: Vec<u16> = OsStr::new(staging_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let wide_target: Vec<u16> = OsStr::new(target_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: MoveFileExW is a standard Win32 file API.
        // wide_staging and wide_target are guaranteed valid, null-terminated UTF-16 vectors.
        // MOVEFILE_REPLACE_EXISTING ensures atomic replacement of existing file.
        // MOVEFILE_WRITE_THROUGH ensures changes are flushed to disk before returning.
        let result = unsafe {
            winapi::um::winbase::MoveFileExW(
                wide_staging.as_ptr(),
                wide_target.as_ptr(),
                winapi::um::winbase::MOVEFILE_REPLACE_EXISTING | winapi::um::winbase::MOVEFILE_WRITE_THROUGH,
            )
        };

        if result == 0 {
            // SAFETY: GetLastError is called immediately after a failed Win32 API call.
            let err_code = unsafe { winapi::um::errhandlingapi::GetLastError() };
            return Err(format!("Windows MoveFileExW failed with error code: {}", err_code));
        }

        Ok(())
    }
}

/// Acquires an exclusive, non-blocking lock on the file.
/// Returns handle or file descriptor as u64.
pub fn lock_file(path_str: &str) -> Result<u64, String> {
    #[cfg(unix)]
    {
        use std::fs::OpenOptions;
        use std::os::unix::io::IntoRawFd;

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path_str)
            .map_err(|e| format!("Failed to open file for locking: {}", e))?;

        let fd = file.into_raw_fd();

        // SAFETY: flock is a standard POSIX system call operating on a valid, open file descriptor.
        // LOCK_EX | LOCK_NB requests an exclusive lock without blocking the calling thread.
        let lock_result = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
        if lock_result != 0 {
            // SAFETY: Close the file descriptor on lock failure to prevent resource leaks.
            unsafe { libc::close(fd) };
            return Err("File is currently locked or cannot acquire exclusive lock".to_string());
        }

        Ok(fd as u64)
    }

    #[cfg(windows)]
    {
        let wide_path: Vec<u16> = OsStr::new(path_str)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: CreateFileW creates or opens the file handle.
        // wide_path is a null-terminated UTF-16 sequence.
        let handle = unsafe {
            winapi::um::fileapi::CreateFileW(
                wide_path.as_ptr(),
                winapi::um::winnt::GENERIC_READ | winapi::um::winnt::GENERIC_WRITE,
                winapi::um::winnt::FILE_SHARE_READ | winapi::um::winnt::FILE_SHARE_WRITE,
                std::ptr::null_mut(),
                winapi::um::fileapi::OPEN_ALWAYS,
                winapi::um::winnt::FILE_ATTRIBUTE_NORMAL,
                std::ptr::null_mut(),
            )
        };

        if handle == winapi::um::handleapi::INVALID_HANDLE_VALUE {
            // SAFETY: GetLastError is called immediately after failed CreateFileW.
            let err_code = unsafe { winapi::um::errhandlingapi::GetLastError() };
            return Err(format!("Failed to open file for locking: error {}", err_code));
        }

        let mut overlapped: winapi::um::minwinbase::OVERLAPPED = unsafe { std::mem::zeroed() };

        // SAFETY: LockFileEx acquires a non-blocking exclusive file lock on the open handle.
        // LOCKFILE_EXCLUSIVE_LOCK requests exclusive access; LOCKFILE_FAIL_IMMEDIATELY prevents blocking.
        let lock_result = unsafe {
            winapi::um::fileapi::LockFileEx(
                handle,
                winapi::um::minwinbase::LOCKFILE_EXCLUSIVE_LOCK | winapi::um::minwinbase::LOCKFILE_FAIL_IMMEDIATELY,
                0,
                1,
                0,
                &mut overlapped,
            )
        };

        if lock_result == 0 {
            // SAFETY: GetLastError called after failed LockFileEx.
            let err_code = unsafe { winapi::um::errhandlingapi::GetLastError() };
            // SAFETY: CloseHandle releases handle on failure to prevent leak.
            unsafe { winapi::um::handleapi::CloseHandle(handle) };
            return Err(format!("Failed to lock file: error {}", err_code));
        }

        Ok(handle as usize as u64)
    }
}

/// Releases the exclusive lock and closes the underlying system handle.
pub fn unlock_file(handle: u64) -> Result<(), String> {
    #[cfg(unix)]
    {
        let fd = handle as libc::c_int;

        // SAFETY: flock with LOCK_UN releases the lock on the valid file descriptor.
        let un_result = unsafe { libc::flock(fd, libc::LOCK_UN) };
        // SAFETY: close closes the valid file descriptor after unlocking.
        let close_result = unsafe { libc::close(fd) };

        if un_result != 0 || close_result != 0 {
            return Err("Failed to release lock or close file descriptor".to_string());
        }

        Ok(())
    }

    #[cfg(windows)]
    {
        let handle_ptr = handle as usize as winapi::um::winnt::HANDLE;
        let mut overlapped: winapi::um::minwinbase::OVERLAPPED = unsafe { std::mem::zeroed() };

        // SAFETY: UnlockFileEx unlocks the byte range on the valid handle.
        let un_result = unsafe {
            winapi::um::fileapi::UnlockFileEx(
                handle_ptr,
                0,
                1,
                0,
                &mut overlapped,
            )
        };

        // SAFETY: CloseHandle closes the opened Windows file handle.
        let close_result = unsafe { winapi::um::handleapi::CloseHandle(handle_ptr) };

        if un_result == 0 || close_result == 0 {
            return Err("Failed to unlock file or close handle".to_string());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    #[test]
    fn test_path_within_boundary() {
        let root = env::temp_dir().to_string_lossy().to_string();
        let path = env::temp_dir()
            .join("subdir")
            .to_string_lossy()
            .to_string();
        assert_eq!(check_path_boundary(&path, &root), true);
    }

    #[test]
    fn test_path_outside_boundary() {
        let root = env::temp_dir()
            .join("isolated-root")
            .to_string_lossy()
            .to_string();
        let path = env::temp_dir().to_string_lossy().to_string();
        assert_eq!(check_path_boundary(&path, &root), false);
    }

    #[test]
    fn test_is_symlink_regular_file() {
        let tmp = env::temp_dir().join("sc-test-regular.txt");
        // JUSTIFICATION: Test harness setup; temporary file creation in temp directory.
        fs::write(&tmp, b"test").expect("Failed to write temporary test file");
        let result = is_symlink_or_junction(&tmp.to_string_lossy());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), false);
        let _ = fs::remove_file(&tmp);
    }
}
