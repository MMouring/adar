const {
  CloudFormationClient,
  UpdateStackSetCommand,
  CreateStackSetCommand,
  CreateStackInstancesCommand,
  DescribeStackSetOperationCommand,
  ListStackSetOperationResultsCommand,
  DescribeStackSetCommand,
  DescribeStackInstanceCommand
} = require('@aws-sdk/client-cloudformation')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts')
const { packagePythonLayers } = require('./package-python-layers')
const fs = require('fs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const {
  ENV,
  TARGET_ACCOUNTS,
  TARGET_REGIONS,
  STACK_SET_NAME,
  AWS_STACK_ADMIN_ARN
} = process.env

if (!ENV || !TARGET_ACCOUNTS || !TARGET_REGIONS || !AWS_STACK_ADMIN_ARN) {
  console.error('Required environment variables not set:')
  console.error('- ENV: Target environment')
  console.error('- TARGET_ACCOUNTS: Comma-separated list of AWS accounts')
  console.error('- TARGET_REGIONS: Comma-separated list of AWS regions')
  console.error('- AWS_STACK_ADMIN_ARN: ARN of the StackSet Administration Role')
  process.exit(1)
}

async function packageAndUpload() {
  // First package Python layers for projects requiring them
  await packagePythonLayers();

  // Assume StackSet Administration Role first
  const sts = new STSClient()
  console.log('Assuming StackSet Administration Role for S3 operations')
  const credentials = await sts.send(
    new AssumeRoleCommand({
      RoleArn: AWS_STACK_ADMIN_ARN,
      RoleSessionName: 'StackSetDeploymentSession'
    })
  )

  // Configure S3 client with assumed role credentials
  const s3 = new S3Client({
    credentials: {
      accessKeyId: credentials.Credentials.AccessKeyId,
      secretAccessKey: credentials.Credentials.SecretAccessKey,
      sessionToken: credentials.Credentials.SessionToken
    }
  })

  const accounts = TARGET_ACCOUNTS.split(',')
  const regions = TARGET_REGIONS.split(',')

  // Read the template file
  const template = await fs.promises.readFile(
    'cloudformation-stack-set.yml',
    'utf8'
  )

  // Package for each account/region combination
  for (const account of accounts) {
    for (const region of regions) {
      // Use CloudFormation package command via AWS CLI
      const { stdout } = await exec(
        `aws cloudformation package --template-file cloudformation-stack-set.yml ` +
        `--output-template-file cloudformation-stack-set-output.yml ` +
        `--s3-bucket hotel-planner-deploy-${account}-${region} ` +
        `--s3-prefix cloudformation --region ${region}`
      )

      // Read the packaged template
      let packagedTemplate = await fs.promises.readFile(
        'cloudformation-stack-set-output.yml',
        'utf8'
      )

      // Replace the S3 URLs with dynamic references
      packagedTemplate = packagedTemplate.replace(
        /CodeUri: s3:\/\/hotel-planner-deploy-[0-9]*-[a-z]*-[a-z]*-[0-9]*\/([^"'\s]+)/g,
        'CodeUri: {Bucket: !Sub "hotel-planner-deploy-${AWS::AccountId}-${AWS::Region}", Key: "$1"}'
      )

      // Upload the final template to the stack sets bucket
      await s3.send(
        new PutObjectCommand({
          Bucket: 'hotel-planner-stack-sets',
          Key: `${STACK_SET_NAME}.yml`,
          Body: packagedTemplate
        })
      )

      console.log(
        `Successfully packaged and uploaded template for account ${account} region ${region}`
      )
    }
  }
}

async function waitForStackSetOperation(
  cfnWithRole,
  operationId,
  stackSetName
) {
  console.log(`Waiting for stack set operation ${operationId} to complete...`)

  while (true) {
    const operation = await cfnWithRole.send(
      new DescribeStackSetOperationCommand({
        StackSetName: stackSetName,
        OperationId: operationId
      })
    )

    const status = operation.StackSetOperation.Status
    console.log(`Current status: ${status}`)

    if (status === 'SUCCEEDED') {
      console.log('Stack set operation completed successfully')
      return
    }

    if (status === 'FAILED' || status === 'STOPPED') {
      // Get detailed error information
      console.error(
        'Stack set operation details:',
        JSON.stringify(operation.StackSetOperation, null, 2)
      )

      // Check for various resource conflicts
      if (operation.StackSetOperation.StatusReason &&
          (operation.StackSetOperation.StatusReason.includes('already exists') ||
           operation.StackSetOperation.StatusReason.includes('ResourceStatusReason'))) {
        console.log('Detected existing resource conflict, checking details...');
        
        const results = await cfnWithRole.send(
          new ListStackSetOperationResultsCommand({
            StackSetName: stackSetName,
            OperationId: operationId
          })
        );

        // Log the specific resources causing conflicts
        if (results.Summaries) {
          for (const summary of results.Summaries) {
            if (summary.Status === 'FAILED') {
              console.log(`Resource conflict in ${summary.Region}: ${summary.StatusReason}`);
            }
          }
        }

        console.log('Continuing deployment with existing resources...');
        return 'CONTINUE';
      }

      // Get detailed results for failed instances
      const results = await cfnWithRole.send(
        new ListStackSetOperationResultsCommand({
          StackSetName: stackSetName,
          OperationId: operationId
        })
      )

      console.error('\nDetailed operation results:')
      if (results.Summaries) {
        for (const summary of results.Summaries) {
          if (summary.Status === 'FAILED') {
            console.error(`\nAccount: ${summary.Account}`)
            console.error(`Region: ${summary.Region}`)
            console.error(`Status: ${summary.Status}`)
            console.error(`Reason: ${summary.StatusReason}`)
          }
        }
      }

      if (operation.StackSetOperation.StatusReason) {
        console.error(
          '\nOperation failure reason:',
          operation.StackSetOperation.StatusReason
        )
      }

      throw new Error(
        `Stack set operation ${operationId} ${status}: Check logs above for detailed failure information`
      )
    }

    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
}

async function checkStackSetExists(cfnClient, stackSetName) {
  try {
    await cfnClient.send(
      new DescribeStackSetCommand({
        StackSetName: stackSetName
      })
    )
    return true
  } catch (err) {
    if (err.name === 'StackSetNotFoundException') {
      return false
    }
    throw err
  }
}

async function checkStackInstanceExists(cfnClient, stackSetName, account, region) {
  try {
    await cfnClient.send(
      new DescribeStackInstanceCommand({
        StackSetName: stackSetName,
        StackInstanceAccount: account,
        StackInstanceRegion: region
      })
    )
    return true
  } catch (err) {
    if (err.name === 'StackInstanceNotFoundException') {
      return false
    }
    throw err
  }
}

async function deploy() {
  const sts = new STSClient()
  const cfn = new CloudFormationClient()

  const accounts = TARGET_ACCOUNTS.split(',')
  const regions = TARGET_REGIONS.split(',')

  // Assume StackSet Administration Role
  console.log('Assuming StackSet Administration Role')
  const credentials = await sts.send(
    new AssumeRoleCommand({
      RoleArn: AWS_STACK_ADMIN_ARN,
      RoleSessionName: 'StackSetDeploymentSession'
    })
  )

  const config = {
    credentials: {
      accessKeyId: credentials.Credentials.AccessKeyId,
      secretAccessKey: credentials.Credentials.SecretAccessKey,
      sessionToken: credentials.Credentials.SessionToken
    }
  }

  const cfnWithRole = new CloudFormationClient(config)

  // Check if stack set exists
  const stackSetExists = await checkStackSetExists(cfnWithRole, STACK_SET_NAME)

  if (!stackSetExists) {
    // Create new stack set
    console.log('Creating new stack set...')
    const createResponse = await cfnWithRole.send(
      new CreateStackSetCommand({
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
      })
    )
    await waitForStackSetOperation(cfnWithRole, createResponse.OperationId, STACK_SET_NAME)
  }

  // Track which instances exist and need updates
  const existingInstances = []
  const newInstances = []

  // Check each account/region combination
  for (const account of accounts) {
    for (const region of regions) {
      const exists = await checkStackInstanceExists(cfnWithRole, STACK_SET_NAME, account, region)
      if (exists) {
        existingInstances.push({ account, region })
      } else {
        newInstances.push({ account, region })
      }
    }
  }

  // Create new instances if needed
  if (newInstances.length > 0) {
    console.log('Creating new stack instances...')
    const createInstancesResponse = await cfnWithRole.send(
      new CreateStackInstancesCommand({
        StackSetName: STACK_SET_NAME,
        Accounts: [...new Set(newInstances.map(i => i.account))],
        Regions: [...new Set(newInstances.map(i => i.region))],
        OperationPreferences: {
          FailureTolerancePercentage: 0,
          MaxConcurrentPercentage: 100,
          RegionConcurrencyType: 'SEQUENTIAL'
        },
        ParameterOverrides: [
          {
            ParameterKey: 'stage',
            ParameterValue: ENV
          }
        ],
        CallAs: 'SELF'
      })
    )
    await waitForStackSetOperation(cfnWithRole, createInstancesResponse.OperationId, STACK_SET_NAME)
  }

  // Update existing instances
  if (existingInstances.length > 0) {
    console.log('Updating existing stack instances...')
    const updateResponse = await cfnWithRole.send(
      new UpdateStackSetCommand({
        StackSetName: STACK_SET_NAME,
        TemplateURL: `https://s3.amazonaws.com/hotel-planner-stack-sets/${STACK_SET_NAME}.yml`,
        Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        Parameters: [
          {
            ParameterKey: 'stage',
            ParameterValue: ENV
          }
        ],
        Accounts: [...new Set(existingInstances.map(i => i.account))],
        Regions: [...new Set(existingInstances.map(i => i.region))],
        OperationPreferences: {
          FailureTolerancePercentage: 0,
          MaxConcurrentPercentage: 100,
          RegionConcurrencyType: 'SEQUENTIAL'
        },
        OperationId: `Update-${Date.now()}`,
        CallAs: 'SELF'
      })
    )
    await waitForStackSetOperation(cfnWithRole, updateResponse.OperationId, STACK_SET_NAME)
  }

  console.log('Stack set deployment completed successfully')
}

const command = process.argv[2]
if (command === 'package') {
  packageAndUpload()
} else if (command === 'deploy') {
  ; (async () => {
    try {
      await packageAndUpload()
      await deploy()
    } catch (error) {
      console.error('Deployment failed:', error)
      process.exit(1)
    }
  })()
} else {
  console.error('Unknown command. Use "package" or "deploy"')
  process.exit(1)
}
