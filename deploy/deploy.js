const { CloudFormationClient, UpdateStackSetCommand, CreateStackSetCommand } = require('@aws-sdk/client-cloudformation');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

const {
  npm_package_config_env: ENV = 'dev',
  npm_package_config_accounts: ACCOUNTS = '',
  npm_package_config_regions: REGIONS = '',
  npm_package_config_stackSetName: STACK_SET_NAME
} = process.env;

async function packageAndUpload() {
  const s3 = new S3Client();
  // Implementation for packaging and uploading to S3
}

async function deploy() {
  const sts = new STSClient();
  const cfn = new CloudFormationClient();
  
  const accounts = ACCOUNTS.split(',');
  const regions = REGIONS.split(',');
  
  // Assume deployment role
  const credentials = await sts.send(new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${accounts[0]}:role/AWSCloudFormationStackSetAdministrationRole${ENV}`,
    RoleSessionName: STACK_SET_NAME
  }));
  
  // Try to create the stack set first
  try {
    await cfn.send(new CreateStackSetCommand({
      StackSetName: STACK_SET_NAME,
      Accounts: accounts,
      Regions: regions,
      TemplateURL: `https://s3.amazonaws.com/lambda-stack-sets/${STACK_SET_NAME}.yml`,
      Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
      AdministrationRoleARN: `arn:aws:iam::${accounts[0]}:role/AWSCloudFormationStackSetAdministrationRole${ENV}`,
      ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole',
      PermissionModel: 'SELF_MANAGED'
    }));
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
  await cfn.send(new UpdateStackSetCommand({
    StackSetName: STACK_SET_NAME,
    Accounts: accounts,
    Regions: regions,
    TemplateURL: `https://s3.amazonaws.com/lambda-stack-sets/${STACK_SET_NAME}.yml`,
    Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
    AdministrationRoleARN: `arn:aws:iam::${accounts[0]}:role/AWSCloudFormationStackSetAdministrationRole${ENV}`,
    ExecutionRoleName: 'AWSCloudFormationStackSetExecutionRole'
  }));
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
