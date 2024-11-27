#!/bin/bash

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

# Upload the CloudFormation template to S3 bucket in each Account and Region
while IFS= read -r ACCOUNT; do
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        BUCKET_NAME="hotel-planner-deploy-${ACCOUNT_ID}-${REGION}"
        echo "Uploading to bucket: $BUCKET_NAME"
        if aws s3 cp cloudformation-stack-set.yml "s3://$BUCKET_NAME/cloudformation-stack-set.yml"; then
            echo "CloudFormation template uploaded successfully"
        else
            echo "Error: Failed to upload CloudFormation template"
            exit 1
        fi
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up temporary file
rm accounts_and_regions.json