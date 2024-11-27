#!/bin/bash

# Define an array of requirement files and corresponding layer names
REQUIREMENT_FILES=("requirements/bing-ads.txt" "requirements/google-ads.txt")
KEY_NAMES=("bing-ads-layer" "google-ads-layer")

# Ensure required environment variables are set
if [ -z "$ACCOUNTS_AND_REGIONS" ]; then
    echo "Error: ACCOUNTS_AND_REGIONS environment variable not set"
    exit 1
fi

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

# Loop through each requirements file
for i in "${!REQUIREMENT_FILES[@]}"; do
    REQUIREMENT_FILE="${REQUIREMENT_FILES[$i]}"
    KEY_NAME="${KEY_NAMES[$i]}"
    ZIP_FILE="${KEY_NAME}.zip"

    # Create a directory for the Python package
    mkdir -p python
    pip install -r "$REQUIREMENT_FILE" -t python

    # Package the Python directory into a zip file
    zip -r "$ZIP_FILE" python
    rm -rf python  # Clean up the python directory

    # Upload the zip file to S3 bucket in each Account and Region
    while IFS= read -r ACCOUNT; do
        ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
        while IFS= read -r REGION; do
            BUCKET_NAME="hotel-planner-deploy-${ACCOUNT_ID}-${REGION}"
            echo "Uploading to bucket: $BUCKET_NAME"
            if aws s3 cp "$ZIP_FILE" "s3://$BUCKET_NAME/$ZIP_FILE"; then
                echo "Python requirements packaged successfully"
            else
                echo "Error: Failed to package Python requirements"
                exit 1
            fi
        done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
    done < <(jq -r 'keys[]' accounts_and_regions.json)
done

# Clean up temporary file
rm accounts_and_regions.json
