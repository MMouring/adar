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
            echo "Operation completed successfully"
            return 0
        elif [ "$STATUS" == "FAILED" ] || [ "$STATUS" == "STOPPED" ]; then
            echo "Operation failed or was stopped"
            echo "Detailed operation info:"
            echo "$OPERATION_INFO" | jq '.'
            
            # Get specific error details from stack instances if available
            INSTANCES_INFO=$(aws cloudformation list-stack-set-operation-results \
                --stack-set-name "$stack_set_name" \
                --operation-id "$operation_id")
            echo "Stack instance results:"
            echo "$INSTANCES_INFO" | jq '.'
            return 1
        fi
        
        echo "Operation in progress... Status: $STATUS"
        sleep 10
    done
}

# Create or update StackSet
OPERATION_ID=$(aws cloudformation update-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --administration-role-arn "$AWS_DEPLOYMENT_ROLE_ARN" \
    --execution-role-name "github-automations-role-dev" \
    --query 'OperationId' \
    --output text || \
aws cloudformation create-stack-set \
    --stack-set-name "$STACK_NAME" \
    --template-body "file://$TEMPLATE_FILE" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --administration-role-arn "$AWS_DEPLOYMENT_ROLE_ARN" \
    --execution-role-name "github-automations-role-dev" \
    --query 'OperationId' \
    --output text)

if [ $? -eq 0 ]; then
    echo "StackSet operation initiated with Operation ID: $OPERATION_ID"
    wait_for_operation "$STACK_NAME" "$OPERATION_ID" || exit 1
else
    echo "Error: Failed to create or update StackSet"
    exit 1
fi

# Deploy to multiple accounts and regions
while IFS= read -r ACCOUNT; do
    ACCOUNT_ID=$(jq -r ".[\"$ACCOUNT\"].account_id" accounts_and_regions.json)
    while IFS= read -r REGION; do
        echo "Deploying to Account: $ACCOUNT_ID, Region: $REGION"
        
        OPERATION_ID=$(aws cloudformation create-stack-instances \
            --stack-set-name "$STACK_NAME" \
            --regions "$REGION" \
            --accounts "$ACCOUNT_ID" \
            --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1 \
            --query 'OperationId' \
            --output text || \
        aws cloudformation update-stack-instances \
            --stack-set-name "$STACK_NAME" \
            --regions "$REGION" \
            --accounts "$ACCOUNT_ID" \
            --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1 \
            --query 'OperationId' \
            --output text)
            
        if [ $? -eq 0 ]; then
            echo "Stack instances operation initiated with Operation ID: $OPERATION_ID"
            wait_for_operation "$STACK_NAME" "$OPERATION_ID" || exit 1
        else
            echo "Error: Failed to deploy stack instances"
            exit 1
        fi
    done < <(jq -r ".[\"$ACCOUNT\"].regions[]" accounts_and_regions.json)
done < <(jq -r 'keys[]' accounts_and_regions.json)

# Clean up temporary file
rm accounts_and_regions.json

# Set environment variable to indicate successful deployment
echo "CLOUDFORMATION_DEPLOYED=true" >> "$GITHUB_ENV"
