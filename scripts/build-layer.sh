#!/bin/bash
set -e

# First argument is the package name
PACKAGE_NAME=$1

# Create temporary build directory
BUILD_DIR=$(mktemp -d)
mkdir -p "$BUILD_DIR/python"

# Install requirements into python directory
pip install -r "requirements/$PACKAGE_NAME.txt" --target "$BUILD_DIR/python"

# Create zip file
cd "$BUILD_DIR"
zip -r "../dist/$PACKAGE_NAME-layer.zip" .

# Cleanup
cd ..
rm -rf "$BUILD_DIR"
