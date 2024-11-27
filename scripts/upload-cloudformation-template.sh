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

log "Starting CloudFormation template upload process"

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

# Upload the CloudFormation template to S3 bucket in each Account and Region
while IFS= read -r ACCOUNT; do
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        BUCKET_NAME="hotel-planner-deploy-${ACCOUNT_ID}-${REGION}"
        log "Uploading template to bucket: $BUCKET_NAME"
        
        retry aws s3 cp cloudformation-stack-set.yml "s3://$BUCKET_NAME/cloudformation-stack-set.yml"
        log "Successfully uploaded template to $BUCKET_NAME"
        
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up
log "Cleaning up temporary files"
rm accounts_and_regions.json

log "CloudFormation template upload completed successfully"
