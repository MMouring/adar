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

# Function to wait for stack set operation to complete
wait_for_operation() {
    local stack_set_name=$1
    local operation_id=$2
    
    while true; do
        OPERATION_INFO=$(aws cloudformation describe-stack-set-operation \
            --stack-set-name "$stack_set_name" \
            --operation-id "$operation_id")
        
        STATUS=$(echo "$OPERATION_INFO" | jq -r '.StackSetOperation.Status')
        
        if [ "$STATUS" == "SUCCEEDED" ]; then
            log "Operation completed successfully"
            return 0
        elif [ "$STATUS" == "FAILED" ] || [ "$STATUS" == "STOPPED" ]; then
            log "Operation failed or was stopped"
            log "Detailed operation info:"
            echo "$OPERATION_INFO" | jq '.'
            
            # Get specific error details from stack instances if available
            INSTANCES_INFO=$(aws cloudformation list-stack-set-operation-results \
                --stack-set-name "$stack_set_name" \
                --operation-id "$operation_id")
            log "Stack instance results:"
            echo "$INSTANCES_INFO" | jq '.'
            return 1
        fi
        
        log "Operation in progress... Status: $STATUS"
        sleep 10
    done
}

# Ensure required environment variables are set
if [ -z "$ENVIRONMENT" ]; then
    log "Error: ENVIRONMENT variable not set"
    exit 1
fi

log "Starting CloudFormation StackSet deployment process"

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

STACK_NAME="${ENVIRONMENT}-hotel-planner-python-lambda-layers-stack-set"
TEMPLATE_FILE="cloudformation-stack-set.yml"

# Create or update StackSet
log "Creating or updating StackSet: $STACK_NAME"
OPERATION_ID=$(retry aws cloudformation update-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --administration-role-arn "$AWS_DEPLOYMENT_ROLE_ARN" \
    --execution-role-name "github-automations-role-dev" \
    --query 'OperationId' \
    --output text || \
retry aws cloudformation create-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --administration-role-arn "$AWS_DEPLOYMENT_ROLE_ARN" \
    --execution-role-name "github-automations-role-dev" \
    --query 'OperationId' \
    --output text)

if [ $? -eq 0 ]; then
    log "StackSet operation initiated with Operation ID: $OPERATION_ID"
    wait_for_operation "$STACK_NAME" "$OPERATION_ID" || exit 1
else
    log "Error: Failed to create or update StackSet"
    exit 1
fi

# Deploy to multiple accounts and regions
while IFS= read -r ACCOUNT; do
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        log "Deploying to Account: $ACCOUNT_ID, Region: $REGION"
        
        OPERATION_ID=$(retry aws cloudformation create-stack-instances \
            --stack-set-name "$STACK_NAME" \
            --regions "$REGION" \
            --accounts "$ACCOUNT_ID" \
            --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1 \
            --query 'OperationId' \
            --output text || \
        retry aws cloudformation update-stack-instances \
            --stack-set-name "$STACK_NAME" \
            --regions "$REGION" \
            --accounts "$ACCOUNT_ID" \
            --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1 \
            --query 'OperationId' \
            --output text)
            
        if [ $? -eq 0 ]; then
            log "Stack instances operation initiated with Operation ID: $OPERATION_ID"
            wait_for_operation "$STACK_NAME" "$OPERATION_ID" || exit 1
        else
            log "Error: Failed to deploy stack instances"
            exit 1
        fi
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up
log "Cleaning up temporary files"
rm accounts_and_regions.json

# Set environment variable to indicate successful deployment
log "Setting CLOUDFORMATION_DEPLOYED environment variable"
echo "CLOUDFORMATION_DEPLOYED=true" >> "$GITHUB_ENV"

log "CloudFormation StackSet deployment completed successfully"
