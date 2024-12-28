const { execSync } = require('child_process');
const fs = require('fs');

const assumeRole = () => {
  const { AWS_DEPLOY_ARN } = process.env;
  if (!AWS_DEPLOY_ARN) {
    throw new Error('AWS_DEPLOY_ARN environment variable is required');
  }

  console.log('Assuming deployment role...');
  const result = JSON.parse(
    execSync(
      `aws sts assume-role --role-arn ${AWS_DEPLOY_ARN} --role-session-name DeploySession`
    ).toString()
  );

  process.env.AWS_ACCESS_KEY_ID = result.Credentials.AccessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = result.Credentials.SecretAccessKey;
  process.env.AWS_SESSION_TOKEN = result.Credentials.SessionToken;
};

const checkStackSetInstances = async (stackSetName, account, region) => {
  try {
    const result = execSync(
      `aws cloudformation list-stack-instances --stack-set-name ${stackSetName} --query "Summaries[?Account=='${account}' && Region=='${region}'].Status" --output text`
    ).toString();
    return result.trim() !== '';
  } catch (error) {
    return false;
  }
};

const createStackSetInstance = async (stackSetName, account, region) => {
  console.log(`Creating stack set instance in account ${account}, region ${region}`);
  execSync(
    `aws cloudformation create-stack-instances --stack-set-name ${stackSetName} \
    --accounts ${account} --regions ${region} \
    --operation-preferences FailureToleranceCount=0,MaxConcurrentCount=1`
  );
};

const updateStackSet = async (stackSetName, accounts, regions) => {
  console.log('Updating stack set...');
  execSync(
    `aws cloudformation update-stack-set \
    --stack-set-name ${stackSetName} \
    --template-url https://s3.amazonaws.com/hotel-planner-stack-sets/${stackSetName}.yml \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --administration-role-arn ${process.env.AWS_STACK_ADMIN_ARN} \
    --execution-role-name AWSCloudFormationStackSetExecutionRole \
    --accounts ${accounts} \
    --regions ${regions}`
  );
};

const deploy = async () => {
  const { STACK_SET_NAME, TARGET_ACCOUNTS, TARGET_REGIONS } = process.env;
  
  // Assume deployment role
  assumeRole();
  const accounts = TARGET_ACCOUNTS.split(',');
  const regions = TARGET_REGIONS.split(',');

  // Check and create missing instances
  for (const account of accounts) {
    for (const region of regions) {
      const exists = await checkStackSetInstances(STACK_SET_NAME, account, region);
      if (!exists) {
        await createStackSetInstance(STACK_SET_NAME, account, region);
      }
    }
  }

  // Update stack set
  await updateStackSet(STACK_SET_NAME, TARGET_ACCOUNTS, TARGET_REGIONS);
};

const package = async () => {
  const { DEFAULT_ACCOUNT, DEFAULT_REGION, STACK_SET_NAME } = process.env;
  
  console.log('Packaging CloudFormation template...');
  execSync(
    `aws cloudformation package \
    --template-file cloudformation-stack-set.yml \
    --output-template-file cloudformation-stack-set-output.yml \
    --s3-bucket hotel-planner-deploy-${DEFAULT_ACCOUNT}-${DEFAULT_REGION} \
    --s3-prefix cloudformation`
  );

  console.log('Uploading template to S3...');
  execSync(
    `aws s3 cp cloudformation-stack-set-output.yml \
    s3://hotel-planner-stack-sets/${STACK_SET_NAME}.yml`
  );
};

if (require.main === module) {
  const command = process.argv[2];
  if (command === 'deploy') {
    deploy().catch(console.error);
  } else if (command === 'package') {
    package().catch(console.error);
  }
}

module.exports = { deploy, package };
