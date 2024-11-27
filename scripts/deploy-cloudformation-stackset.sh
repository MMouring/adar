#!/bin/bash

# Ensure required environment variables are set and previous step was successful
if [ -z "$ENVIRONMENT" ]; then
    echo "Error: ENVIRONMENT variable not set"
    exit 1
fi

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

STACK_NAME="${ENVIRONMENT}-hotel-planner-python-lambda-layers-stack-set"
TEMPLATE_FILE="cloudformation-stack-set.yml"

# Create or update StackSet (capabilities needed here)
if aws cloudformation create-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND; then
    echo "StackSet created successfully"
elif aws cloudformation update-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND; then
    echo "StackSet updated successfully"
else
    echo "Error: Failed to create or update StackSet"
    exit 1
fi

# Deploy to multiple accounts and regions
while IFS= read -r ACCOUNT; do
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        echo "Deploying to Account: $ACCOUNT_ID, Region: $REGION"
        if aws cloudformation create-stack-instances \
            --stack-set-name "$STACK_NAME" \
            --regions "$REGION" \
            --accounts "$ACCOUNT_ID" \
            --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1; then
            echo "CloudFormation stack deployed successfully"
        else
            echo "Error: Failed to deploy CloudFormation stack"
            exit 1
        fi
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up temporary file
rm accounts_and_regions.json

# Set environment variable to indicate successful deployment
echo "CLOUDFORMATION_DEPLOYED=true" >> "$GITHUB_ENV"