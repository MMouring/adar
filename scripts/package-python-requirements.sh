#!/bin/bash

set -e

# Function for logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to handle errors
error_handler() {
    log "Error occurred in script at line: $1"
    exit 1
}

trap 'error_handler ${LINENO}' ERR

# Function to retry commands
retry() {
    local max_attempts=3
    local delay=5
    local attempt=1
    
    while true; do
        "$@" && break || {
            if [[ $attempt -lt $max_attempts ]]; then
                log "Command failed. Attempt $attempt/$max_attempts. Retrying in $delay seconds..."
                sleep $delay
                ((attempt++))
            else
                log "Command failed after $max_attempts attempts. Exiting..."
                return 1
            fi
        }
    done
}

# Define an array of requirement files and corresponding layer names
REQUIREMENT_FILES=("requirements/bing-ads.txt" "requirements/google-ads.txt")
KEY_NAMES=("bing-ads-layer" "google-ads-layer")

# Ensure required environment variables are set
if [ -z "$ACCOUNTS_AND_REGIONS" ]; then
    log "Error: ACCOUNTS_AND_REGIONS environment variable not set"
    exit 1
fi

log "Starting Python requirements packaging process"

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

# Loop through each requirements file
for i in "${!REQUIREMENT_FILES[@]}"; do
    REQUIREMENT_FILE="${REQUIREMENT_FILES[$i]}"
    KEY_NAME="${KEY_NAMES[$i]}"
    ZIP_FILE="${KEY_NAME}.zip"

    log "Processing $REQUIREMENT_FILE for $KEY_NAME"

    # Create a directory for the Python package
    log "Creating Python package directory"
    mkdir -p python

    # Install requirements with retry
    log "Installing Python requirements from $REQUIREMENT_FILE"
    retry pip install -r "$REQUIREMENT_FILE" -t python

    # Package the Python directory into a zip file
    log "Creating ZIP file: $ZIP_FILE"
    retry zip -r "$ZIP_FILE" python
    rm -rf python  # Clean up the python directory

    # Upload the zip file to S3 bucket in each Account and Region
    while IFS= read -r ACCOUNT; do
        ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
        while IFS= read -r REGION; do
            BUCKET_NAME="hotel-planner-deploy-${ACCOUNT_ID}-${REGION}"
            log "Uploading to bucket: $BUCKET_NAME"
            
            retry aws s3 cp "$ZIP_FILE" "s3://$BUCKET_NAME/$ZIP_FILE"
            log "Successfully uploaded $ZIP_FILE to $BUCKET_NAME"
            
        done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
    done < <(jq -r 'keys[]' accounts_and_regions.json)
done

# Clean up
log "Cleaning up temporary files"
rm accounts_and_regions.json

log "Python requirements packaging completed successfully"
