$ErrorActionPreference = "Stop"
Write-Host "Building safe-change native module..."
if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
  Write-Host "Rust toolchain not found. Skipping native build."
  Write-Host "Install from: https://rustup.rs"
  exit 0
}
Set-Location crates/safe-change-native
npx napi build --platform --release
Write-Host "Native build complete."
