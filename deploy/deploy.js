const { CloudFormationClient, UpdateStackSetCommand, CreateStackSetCommand, DescribeStackSetOperationCommand } = require('@aws-sdk/client-cloudformation');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { packagePythonLayers } = require('./package-python-layers');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const {
  npm_package_config_env: ENV,
  npm_package_config_accounts: ACCOUNTS,
  npm_package_config_regions: REGIONS,
  npm_package_config_stackSetName: STACK_SET_NAME,
  AWS_STACK_ADMIN_ARN
} = process.env;

if (!ENV || !ACCOUNTS || !REGIONS || !AWS_STACK_ADMIN_ARN) {
  console.error('Required environment variables not set:');
  console.error('- npm_package_config_env: Target environment');
  console.error('- npm_package_config_accounts: Comma-separated list of AWS accounts');
  console.error('- npm_package_config_regions: Comma-separated list of AWS regions');
  console.error('- AWS_STACK_ADMIN_ARN: ARN of the StackSet Administration Role');
  process.exit(1);
}

async function packageAndUpload() {
  // First package Python layers
  await packagePythonLayers();
  
  const s3 = new S3Client();
  const accounts = ACCOUNTS.split(',');
  const regions = REGIONS.split(',');
  
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

async function waitForStackSetOperation(cfn, operationId, stackSetName) {
  console.log(`Waiting for stack set operation ${operationId} to complete...`);
  
  while (true) {
    const operation = await cfn.send(new DescribeStackSetOperationCommand({
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
      throw new Error(`Stack set operation ${operationId} ${status}`);
    }
    
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

async function deploy() {
  const sts = new STSClient();
  const cfn = new CloudFormationClient();
  
  const accounts = ACCOUNTS.split(',');
  const regions = REGIONS.split(',');
  
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
  
  // Try to create the stack set first
  try {
    const createResponse = await cfnWithRole.send(new CreateStackSetCommand({
      StackSetName: STACK_SET_NAME,
      Accounts: accounts,
      Regions: regions,
      TemplateURL: `https://s3.amazonaws.com/hotel-planner-stack-sets/${STACK_SET_NAME}.yml`,
      Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
      ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole',
      PermissionModel: 'SELF_MANAGED',
      CallAs: 'DELEGATED_ADMIN'
    }));
    console.log('Stack set creation initiated');
    await waitForStackSetOperation(cfn, createResponse.OperationId, STACK_SET_NAME);
    console.log('Stack set created successfully');
  } catch (err) {
    if (err.name !== 'NameAlreadyExistsException') {
      console.log('Stack set already exists, proceeding with update');
    } else {
      console.error('Error creating stack set:', err);
      throw err;
    }
  }

  // Always update the stack set to ensure instances are created/updated
  const updateResponse = await cfnWithRole.send(new UpdateStackSetCommand({
    StackSetName: STACK_SET_NAME,
    Accounts: accounts,
    Regions: regions,
    TemplateURL: `https://s3.amazonaws.com/hotel-planner-stack-sets/${STACK_SET_NAME}.yml`,
    Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
    ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole',
    CallAs: 'DELEGATED_ADMIN'
  }));
  
  console.log('Stack set update initiated');
  await waitForStackSetOperation(cfn, updateResponse.OperationId, STACK_SET_NAME);
  console.log('Stack set updated successfully');
}

const command = process.argv[2];
if (command === 'package') {
  packageAndUpload();
} else if (command === 'deploy') {
  deploy();
} else {
  console.error('Unknown command. Use "package" or "deploy"');
  process.exit(1);
}
