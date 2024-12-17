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

    while (( attempt <= max_attempts )); do
        "$@" && return 0
        log "Command failed. Attempt $attempt/$max_attempts. Retrying in $delay seconds..."
        sleep $delay
        ((attempt++))
    done

    log "Command failed after $max_attempts attempts."
    return 1
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

log "Starting CloudFormation StackSet deployment process"

# Store the JSON in a temporary file for jq processing
echo "$ACCOUNTS_AND_REGIONS" > accounts_and_regions.json

# Modify the stack set name for deploys
STACK_NAME="hotel-planner-python-lambda-layers-stack-set"
TEMPLATE_FILE="cloudformation-stack-set.yml"

# Assume StackSet Administration Role before CloudFormation operations
log "Assuming StackSet Administration Role"
ASSUMED_ROLE_CREDENTIALS=$(aws sts assume-role \
    --role-arn "$AWS_STACK_ADMIN_ARN" \
    --role-session-name "StackSetDeploymentSession")

# Extract and export temporary credentials
export AWS_ACCESS_KEY_ID=$(echo "$ASSUMED_ROLE_CREDENTIALS" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "$ASSUMED_ROLE_CREDENTIALS" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "$ASSUMED_ROLE_CREDENTIALS" | jq -r '.Credentials.SessionToken')

# Add a cleanup trap to unset credentials after script completion
cleanup() {
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    unset AWS_SESSION_TOKEN
}
trap cleanup EXIT

OPERATION_ID=""
update_error=0


# Deploy to multiple accounts and regions
while IFS= read -r ACCOUNT; do
    REGIONS=""
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        log "Deploying to Account: $ACCOUNT_ID, Region: $REGION"

        # Create or update StackSet
        log "Creating or updating StackSet: $STACK_NAME"
        # Process SAM template first
        sam package \
            --template-file "$TEMPLATE_FILE" \
            --output-template-file "${TEMPLATE_FILE}.packaged" \
            --s3-bucket "lambda-layer-artifacts-${ACCOUNT_ID}"

        OPERATION_ID=$(retry aws cloudformation update-stack-set \
            --stack-set-name "$STACK_NAME" \
            --template-body "file://${TEMPLATE_FILE}.packaged" \
            --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
            --administration-role-arn "$AWS_STACK_ADMIN_ARN" \
            --parameters "[{\"ParameterKey\":\"stage\",\"ParameterValue\":\"$ENVIRONMENT\"}]" \
            --execution-role-name "AWSCloudFormationStackSetExecutionRole" \
            --accounts "$ACCOUNT_ID" \
            --regions "$REGION" \
            --query 'OperationId' \
            --output text)

        # Check if OPERATION_ID is valid after update
        if [[ -z "$OPERATION_ID" ]]; then
            log "Update failed, attempting to create StackSet: $STACK_NAME"
            OPERATION_ID=$(retry aws cloudformation create-stack-set \
                --stack-set-name "$STACK_NAME" \
                --template-body "file://${TEMPLATE_FILE}.packaged" \
                --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
                --administration-role-arn "$AWS_STACK_ADMIN_ARN" \
                --parameters "[{\"ParameterKey\":\"stage\",\"ParameterValue\":\"$ENVIRONMENT\"}]" \
                --execution-role-name "AWSCloudFormationStackSetExecutionRole" \
                --accounts "$ACCOUNT_ID" \
                --regions "$REGION" \
                --query 'OperationId' \
                --output text)
            
            # Check if OPERATION_ID is valid after create
            if [[ -z "$OPERATION_ID" ]]; then
                log "Failed to create StackSet. Please check the template and parameters."
                exit 1
            fi
        fi

        # Validate OPERATION_ID again
        if [[ -z "$OPERATION_ID" ]]; then
            log "Error: Unable to retrieve a valid Operation ID."
            exit 1
        fi

        log "StackSet operation initiated with Operation ID: $OPERATION_ID"
        wait_for_operation "$STACK_NAME" "$OPERATION_ID" || {
            log "StackSet operation failed. Exiting."
            exit 1
        }
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

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
            --output text)

        if [[ $? -ne 0 || -z "$OPERATION_ID" ]]; then
            log "Update failed, attempting to update StackSet instances"
            OPERATION_ID=$(retry aws cloudformation update-stack-instances \
                --stack-set-name "$STACK_NAME" \
                --regions "$REGION" \
                --accounts "$ACCOUNT_ID" \
                --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1 \
                --query 'OperationId' \
                --output text)
            if [[ $? -ne 0 || -z "$OPERATION_ID" ]]; then
                log "Error: Failed to deploy stack instances"
                exit 1
            fi
        fi

        log "Stack instances operation initiated with Operation ID: $OPERATION_ID"
        wait_for_operation "$STACK_NAME" "$OPERATION_ID" || exit 1
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up
log "Cleaning up temporary files"
rm accounts_and_regions.json

# Set environment variable to indicate successful deployment
log "Setting CLOUDFORMATION_DEPLOYED environment variable"
echo "CLOUDFORMATION_DEPLOYED=true" >> "$GITHUB_ENV"

log "CloudFormation StackSet deployment completed successfully"

