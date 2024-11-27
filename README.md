# Hotel Planner Python Lambda Layers
# THIS IS A WORK IN PROGRESS AND NOT YET FUNCTIONAL
## Initialization
### install modules
Install dev node modules
```sh
$ npm install
```

## Development
### deploy
To build the project and create/deploy code changes to the dev lambda function.
```sh
$ npm run deploy
```

## Production
### deploy
Commit changes.
The build is initiated by updating the version. This updates the version, tags and pushes to main, and pushes to release branch.
```sh
$ npm version patch|minor|major
```
The build will need to be approved in CodePipeline for it to be deployed to the production live stage.

## Stack Set
### Assume Role
This will create a profile to use in subsequent commands
```sh
$ export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:aws:iam::677996239377:role/AWSCloudFormationStackSetAdministrationRoledev --role-session-name hotel-planner-python-lambda-layers --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text)) && aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID --profile hp-deploy && aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY --profile hp-deploy && aws configure set aws_session_token $AWS_SESSION_TOKEN --profile hp-deploy && aws configure set region us-east-1 --profile hp-deploy
```
Switch back to your development profile via sso

### Create
```sh
$ npm install
$ npm run test
$ npm run cloudformation:package
$ aws cloudformation create-stack-set --template-url https://s3.amazonaws.com/hotel-planner-stack-sets/hotel-planner-python-lambda-layers-stack-set.yml --stack-set-name hotel-planner-python-lambda-layers-stack-set --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --administration-role-arn arn:aws:iam::677996239377:role/AWSCloudFormationStackSetAdministrationRoledev --execution-role-name AWSCloudFormationStackSetExecutionRole --profile hp-deploy
```

### Create Instances
Specify the accounts and regions
```sh
$ aws cloudformation create-stack-instances --stack-set-name hotel-planner-python-lambda-layers-stack-set --accounts $accounts --regions $regions --profile hp-deploy
```

### Delete Instances
Specify the accounts and regions
```sh
$ aws cloudformation delete-stack-instances --stack-set-name hotel-planner-python-lambda-layers-stack-set --no-retain-stacks --accounts $accounts --regions $regions --profile hp-deploy
```

### Delete
```sh
$ aws cloudformation delete-stack-set --stack-set-name hotel-planner-python-lambda-layers-stack-set --profile hp-deploy
```
