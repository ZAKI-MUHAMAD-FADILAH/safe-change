#!/bin/sh
set -e
echo "Building safe-change native module..."
if ! command -v cargo > /dev/null 2>&1; then
  echo "Rust toolchain not found. Skipping native build."
  echo "Install from: https://rustup.rs"
  exit 0
fi
cd crates/safe-change-native
npx napi build --platform --release
echo "Native build complete."
