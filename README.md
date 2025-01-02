# Hotel Planner Python Lambda Layers
## TO-DO: Include guidance on how to include reference to dev / prod ARNs in order to access them in your cloudformation stackset templates# Hotel Planner Python Lambda Layers

This repository manages Python Lambda layers for hotel planner cloud/serverless projects. It provides a centralized way to manage and deploy common Python dependencies across multiple AWS Lambda functions.

## Current Layers

- **Bing Ads Layer** (`~13.0.21.2`) - Microsoft Bing Ads API integration
- **Google Ads Layer** (`~25.1.0`) - Google Ads API integration
- **PYTZ Layer** (`~2024.2`) - Timezone database for Python

## Architecture

The project uses AWS CloudFormation StackSets to deploy Lambda layers across multiple AWS accounts and regions. This ensures consistent dependency versions across your entire AWS infrastructure.

### Key Components

- CloudFormation template defining Lambda layers
- GitHub Actions workflows for automated deployment
- Node.js-based deployment scripts
- Requirements files for Python dependencies

## Deployment Process

Deployments are managed through Git branches and GitHub Actions:

- `main` branch → Production environment
- `stage` branch → Staging environment
- Other branches → Development environment

### Automated Deployments

The GitHub Actions workflow (`deploy.yml`) handles:

1. Python layer packaging
2. S3 upload of layer packages
3. CloudFormation StackSet deployment
4. Release creation (for production deployments)

### Environment Management

Environments are determined by:
- Manual trigger with environment selection
- Automatic detection based on branch name:
  - `main` → prod
  - `stage` → stage
  - others → dev

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm ci
   ```

3. Configure AWS credentials and required environment variables:
   - AWS_ACCOUNT_ID
   - AWS_REGION
   - AWS_ROLE_NAME
   - AWS_STACK_ADMIN_ARN
   - TARGET_ACCOUNTS
   - TARGET_REGIONS

## Development

### Adding New Python Dependencies

1. Create a new requirements file in the `requirements/` directory
2. Add the dependency with version constraint
3. Update `cloudformation-stack-set.yml` with the new layer definition

### Testing

Tests run automatically in the CI pipeline. To run locally:

```bash
npm test
```

### Manual Deployment

While deployments typically happen through GitHub Actions, you can trigger them manually:

```bash
npm run deploy
```

## Release Process

Releases are automatically created when:
1. Deployment to production succeeds
2. The deployment was triggered from the `main` branch

Release notes are generated from `release.txt`.

## Version History

Current version: 1.1.2

See [Releases](../../releases) for detailed changelog.
