const {
  CloudFormationClient,
  UpdateStackSetCommand,
  CreateStackSetCommand,
  CreateStackInstancesCommand,
  DescribeStackSetOperationCommand,
  ListStackSetOperationResultsCommand
} = require('@aws-sdk/client-cloudformation');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { packagePythonLayers } = require('./package-python-layers');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const {
  ENV,
  TARGET_ACCOUNTS,
  TARGET_REGIONS,
  STACK_SET_NAME,
  AWS_STACK_ADMIN_ARN
} = process.env;

if (!ENV || !TARGET_ACCOUNTS || !TARGET_REGIONS || !AWS_STACK_ADMIN_ARN) {
  console.error('Required environment variables not set:');
  console.error('- ENV: Target environment');
  console.error('- TARGET_ACCOUNTS: Comma-separated list of AWS accounts');
  console.error('- TARGET_REGIONS: Comma-separated list of AWS regions');
  console.error('- AWS_STACK_ADMIN_ARN: ARN of the StackSet Administration Role');
  process.exit(1);
}

async function packageAndUpload() {
  // First package Python layers for projects requiring them
  // await packagePythonLayers();

  // Assume StackSet Administration Role first
  const sts = new STSClient();
  console.log('Assuming StackSet Administration Role for S3 operations');
  const credentials = await sts.send(new AssumeRoleCommand({
    RoleArn: AWS_STACK_ADMIN_ARN,
    RoleSessionName: 'StackSetDeploymentSession'
  }));

  // Configure S3 client with assumed role credentials
  const s3 = new S3Client({
    credentials: {
      accessKeyId: credentials.Credentials.AccessKeyId,
      secretAccessKey: credentials.Credentials.SecretAccessKey,
      sessionToken: credentials.Credentials.SessionToken
    }
  });

  const accounts = TARGET_ACCOUNTS.split(',');
  const regions = TARGET_REGIONS.split(',');

  // Read the template file
  const template = await fs.promises.readFile('cloudformation-stack-set.yml', 'utf8');

  // Package for each account/region combination
  for (const account of accounts) {
    for (const region of regions) {
      // Use CloudFormation package command via AWS CLI
      const { stdout } = await exec(
        `aws cloudformation package --template-file cloudformation-stack-set.yml ` +
        `--output-template-file cloudformation-stack-set-output.yml ` +
        `--s3-bucket hotel-planner-deploy-${account}-${region} ` +
        `--s3-prefix cloudformation --region ${region}`
      );

      // Read the packaged template
      let packagedTemplate = await fs.promises.readFile('cloudformation-stack-set-output.yml', 'utf8');

      // Replace the S3 URLs with dynamic references
      packagedTemplate = packagedTemplate.replace(
        /CodeUri: s3:\/\/hotel-planner-deploy-[0-9]*-[a-z]*-[a-z]*-[0-9]*\/([^"'\s]+)/g,
        'CodeUri: {Bucket: !Sub "hotel-planner-deploy-${AWS::AccountId}-${AWS::Region}", Key: "$1"}'
      );

      // Upload the final template to the stack sets bucket
      await s3.send(new PutObjectCommand({
        Bucket: 'hotel-planner-stack-sets',
        Key: `${STACK_SET_NAME}.yml`,
        Body: packagedTemplate
      }));

      console.log(`Successfully packaged and uploaded template for account ${account} region ${region}`);
    }
  }
}

async function waitForStackSetOperation(cfnWithRole, operationId, stackSetName) {
  console.log(`Waiting for stack set operation ${operationId} to complete...`);

  while (true) {
    const operation = await cfnWithRole.send(new DescribeStackSetOperationCommand({
      StackSetName: stackSetName,
      OperationId: operationId
    }));

    const status = operation.StackSetOperation.Status;
    console.log(`Current status: ${status}`);

    if (status === 'SUCCEEDED') {
      console.log('Stack set operation completed successfully');
      return;
    }

    if (status === 'FAILED' || status === 'STOPPED') {
      // Get detailed error information
      console.error('Stack set operation details:', JSON.stringify(operation.StackSetOperation, null, 2));

      // Get detailed results for failed instances
      const results = await cfnWithRole.send(new ListStackSetOperationResultsCommand({
        StackSetName: stackSetName,
        OperationId: operationId
      }));

      console.error('\nDetailed operation results:');
      if (results.Summaries) {
        for (const summary of results.Summaries) {
          if (summary.Status === 'FAILED') {
            console.error(`\nAccount: ${summary.Account}`);
            console.error(`Region: ${summary.Region}`);
            console.error(`Status: ${summary.Status}`);
            console.error(`Reason: ${summary.StatusReason}`);
          }
        }
      }

      if (operation.StackSetOperation.StatusReason) {
        console.error('\nOperation failure reason:', operation.StackSetOperation.StatusReason);
      }

      throw new Error(`Stack set operation ${operationId} ${status}: Check logs above for detailed failure information`);
    }

    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

async function deploy() {
  const sts = new STSClient();
  const cfn = new CloudFormationClient();

  const accounts = TARGET_ACCOUNTS.split(',');
  const regions = TARGET_REGIONS.split(',');

  // Assume StackSet Administration Role
  console.log('Assuming StackSet Administration Role');
  const credentials = await sts.send(new AssumeRoleCommand({
    RoleArn: AWS_STACK_ADMIN_ARN,
    RoleSessionName: 'StackSetDeploymentSession'
  }));

  // Configure AWS SDK with temporary credentials
  const config = {
    credentials: {
      accessKeyId: credentials.Credentials.AccessKeyId,
      secretAccessKey: credentials.Credentials.SecretAccessKey,
      sessionToken: credentials.Credentials.SessionToken
    }
  };

  // Create new CloudFormation client with assumed role credentials
  const cfnWithRole = new CloudFormationClient(config);

  // First create/update the stack set definition (without instances)
  try {
    const createResponse = await cfnWithRole.send(new CreateStackSetCommand({
      StackSetName: STACK_SET_NAME,
      TemplateURL: `https://s3.amazonaws.com/hotel-planner-stack-sets/${STACK_SET_NAME}.yml`,
      Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
      PermissionModel: 'SELF_MANAGED',
      Parameters: [
        {
          ParameterKey: 'stage',
          ParameterValue: ENV
        }
      ],
      AdministrationRoleARN: AWS_STACK_ADMIN_ARN,
      ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole'
    }));
    console.log('Stack set creation initiated');
    await waitForStackSetOperation(cfnWithRole, createResponse.OperationId, STACK_SET_NAME);
    console.log('Stack set created successfully');
  } catch (err) {
    if (err.name === 'NameAlreadyExistsException') {
      console.log('Stack set already exists, proceeding with update');

      // Update only the stack set template/configuration without instances
      const updateResponse = await cfnWithRole.send(new UpdateStackSetCommand({
        StackSetName: STACK_SET_NAME,
        TemplateURL: `https://s3.amazonaws.com/hotel-planner-stack-sets/${STACK_SET_NAME}.yml`,
        Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        Parameters: [
          {
            ParameterKey: 'stage',
            ParameterValue: ENV
          }
        ],
        Accounts: accounts,
        Regions: regions,
        OperationPreferences: {
          FailureTolerancePercentage: 0,
          MaxConcurrentPercentage: 100,
          RegionConcurrencyType: 'PARALLEL'
        },
        PermissionModel: 'SELF_MANAGED',
        AdministrationRoleARN: AWS_STACK_ADMIN_ARN,
        ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole',
        OperationId: `UpdateTemplate-${Date.now()}`,
        CallAs: 'SELF'
      }));

      await waitForStackSetOperation(cfnWithRole, updateResponse.OperationId, STACK_SET_NAME);
      console.log('Stack set template updated successfully');
    } else {
      console.error('Error creating stack set:', err);
      throw err;
    }
  }

  // Create or update stack instances in target accounts
  console.log('Creating/updating stack instances...');
  try {
    const instanceParams = {
      StackSetName: STACK_SET_NAME,
      Accounts: accounts,
      Regions: regions,
      OperationPreferences: {
        FailureTolerancePercentage: 0,
        MaxConcurrentPercentage: 100,
        RegionConcurrencyType: 'PARALLEL'
      },
      CallAs: 'SELF'
    };

    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        // Always attempt to create new stack instances
        const createInstancesResponse = await cfnWithRole.send(new CreateStackInstancesCommand(instanceParams));
        console.log('Stack instance creation initiated');
        await waitForStackSetOperation(cfnWithRole, createInstancesResponse.OperationId, STACK_SET_NAME);
        console.log('Stack instances created/updated successfully');
        break;
      } catch (instanceErr) {
        if (instanceErr.name === 'OperationInProgressException') {
          console.log('Operation in progress, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
          retryCount++;
          if (retryCount === maxRetries) {
            throw new Error('Max retries reached waiting for operation completion');
          }
          continue;
        }
        // If we get any other error, log it and throw
        console.error('Error creating stack instances:', instanceErr);
        throw instanceErr;
      }
    }
  } catch (err) {
    console.error('Error managing stack instances:', err);
    throw err;
  }
  console.log('Stack set updated successfully');
}

const command = process.argv[2];
if (command === 'package') {
  packageAndUpload();
} else if (command === 'deploy') {
  (async () => {
    try {
      await packageAndUpload();
      await deploy();
    } catch (error) {
      console.error('Deployment failed:', error);
      process.exit(1);
    }
  })();
} else {
  console.error('Unknown command. Use "package" or "deploy"');
  process.exit(1);
}
