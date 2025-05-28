# Keyvex AWS Infrastructure

This directory contains the AWS CDK infrastructure code for the Keyvex platform, providing a complete serverless backend to support the Next.js application.

## Architecture Overview

The infrastructure consists of the following components:

### Core Stacks
- **SecurityStack**: IAM roles, policies, and AWS Secrets Manager for secure configuration
- **DatabaseStack**: DynamoDB single-table design, ElastiCache Redis, and SQS queues
- **StorageStack**: S3 buckets for file uploads and CloudFront CDN for asset delivery
- **ComputeStack**: Lambda functions for AI processing, analytics, WebSocket handling, and email processing
- **ApiStack**: API Gateway WebSocket API for real-time communication and REST API for external integrations
- **MonitoringStack**: CloudWatch dashboards, alarms, and SNS alerts for comprehensive monitoring

### Key Features
- **Single-table DynamoDB design** with GSIs for efficient querying
- **ElastiCache Redis cluster** for high-performance caching and session storage
- **SQS queues with DLQs** for reliable background processing
- **Lambda functions** for AI processing, analytics, WebSocket handling, and email processing
- **S3 buckets with lifecycle policies** for user uploads, public assets, and tool-specific content
- **CloudFront distribution** for global content delivery
- **Comprehensive monitoring** with CloudWatch dashboards and SNS alerts

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js 18+** installed
3. **AWS CDK CLI** installed globally: `npm install -g aws-cdk`
4. **AWS Account** with sufficient permissions for CDK deployment

## Installation

1. Install dependencies:
```bash
npm install
```

2. Bootstrap CDK (first time only):
```bash
cdk bootstrap
```

## Build Process

### Build CDK Infrastructure
```bash
npm run build
```

### Build Lambda Functions
```bash
npm run build-lambdas
```

### Build Everything
```bash
npm run deploy-dev  # For development environment
npm run deploy-prod # For production environment
```

## Deployment

### Development Environment
```bash
npm run deploy-dev
```

### Production Environment
```bash
npm run deploy-prod
```

### Individual Stack Deployment
```bash
cdk deploy Keyvex-development-Security
cdk deploy Keyvex-development-Database
cdk deploy Keyvex-development-Storage
cdk deploy Keyvex-development-Compute
cdk deploy Keyvex-development-Api
cdk deploy Keyvex-development-Monitoring
```

## Environment Variables for Next.js Application

After deployment, update your Next.js application's environment variables:

### Required AWS Configuration
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# DynamoDB
DYNAMODB_TABLE_NAME=keyvex-main-table-development
DYNAMODB_ENDPOINT=https://dynamodb.us-east-1.amazonaws.com

# ElastiCache Redis
REDIS_ENDPOINT=keyvex-redis-cluster-endpoint
REDIS_PORT=6379

# SQS Queues
SQS_AI_PROCESSING_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../keyvex-ai-processing-queue-development
SQS_ANALYTICS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../keyvex-analytics-queue-development
SQS_EMAIL_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../keyvex-email-queue-development

# S3 Storage
S3_USER_UPLOADS_BUCKET=keyvex-user-uploads-development-123456789012
S3_PUBLIC_ASSETS_BUCKET=keyvex-public-assets-development-123456789012
S3_TOOL_ASSETS_BUCKET=keyvex-tool-assets-development-123456789012

# CloudFront
CLOUDFRONT_DOMAIN=d1234567890123.cloudfront.net

# API Gateway
WEBSOCKET_API_ENDPOINT=wss://abcdef123.execute-api.us-east-1.amazonaws.com/dev

# Secrets Manager
SECRETS_MANAGER_REGION=us-east-1
AI_SECRETS_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:keyvex/ai/development-AbCdEf
INTEGRATION_SECRETS_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:keyvex/integrations/development-AbCdEf
DATABASE_SECRETS_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:keyvex/database/development-AbCdEf

# Existing Variables (keep current values)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_test_...
UNSPLASH_ACCESS_KEY=...

# Debug Configuration (development only)
DISABLE_AUTH_FOR_DEBUG=true
DEBUG_USER_ID=debug-user-123
ENABLE_METRICS_TRACKING=true
```

## Secrets Management

After deployment, update the secrets in AWS Secrets Manager:

### AI Secrets (`keyvex/ai/{environment}`)
```json
{
  "openai_api_key": "sk-...",
  "anthropic_api_key": "sk-ant-...",
  "openai_organization": "org-..."
}
```

### Integration Secrets (`keyvex/integrations/{environment}`)
```json
{
  "unsplash_access_key": "...",
  "unsplash_secret_key": "...",
  "sendgrid_api_key": "SG...",
  "stripe_secret_key": "sk_..."
}
```

### Database Secrets (`keyvex/database/{environment}`)
```json
{
  "encryption_key": "base64-encoded-key",
  "redis_auth_token": "..."
}
```

## Lambda Functions

### AI Processor (`keyvex-ai-processor-{environment}`)
- **Purpose**: Handles long-running AI operations that exceed Vercel timeout limits
- **Trigger**: SQS messages from AI Processing Queue
- **Timeout**: 15 minutes
- **Memory**: 1024 MB

### Analytics Processor (`keyvex-analytics-processor-{environment}`)
- **Purpose**: Processes analytics data and generates insights
- **Trigger**: SQS messages from Analytics Queue
- **Timeout**: 5 minutes
- **Memory**: 512 MB

### WebSocket Handler (`keyvex-websocket-handler-{environment}`)
- **Purpose**: Manages WebSocket connections for real-time updates
- **Trigger**: API Gateway WebSocket events
- **Timeout**: 30 seconds
- **Memory**: 256 MB

### Email Processor (`keyvex-email-processor-{environment}`)
- **Purpose**: Handles email notifications and campaigns
- **Trigger**: SQS messages from Email Queue
- **Timeout**: 2 minutes
- **Memory**: 256 MB

## Database Schema

### DynamoDB Single-Table Design

**Table Name**: `keyvex-main-table-{environment}`

**Primary Key**:
- Partition Key: `PK` (String)
- Sort Key: `SK` (String)

**Global Secondary Indexes**:
- **GSI1**: `GSI1PK` (String), `GSI1SK` (String)
- **GSI2**: `GSI2PK` (String), `GSI2SK` (String)

**Entity Types**:
- Users: `PK: USER#{clerkId}`, `SK: PROFILE`
- Tools: `PK: USER#{clerkId}`, `SK: TOOL#{toolId}`
- AI Sessions: `PK: SESSION#{sessionId}`, `SK: METADATA`
- Messages: `PK: SESSION#{sessionId}`, `SK: MESSAGE#{timestamp}#{messageId}`
- Leads: `PK: TOOL#{toolId}`, `SK: LEAD#{leadId}`
- Analytics: `PK: TOOL#{toolId}`, `SK: INTERACTION#{timestamp}#{interactionId}`
- Metrics: `PK: METRIC#{date}`, `SK: REQUEST#{timestamp}#{requestId}`
- Alerts: `PK: ALERT#{alertId}`, `SK: ALERT`

## Storage Buckets

### User Uploads Bucket
- **Purpose**: Private storage for user-uploaded files
- **Versioning**: Enabled
- **Lifecycle**: Transition to IA after 30 days, Glacier after 90 days
- **Access**: Authenticated users only

### Public Assets Bucket
- **Purpose**: Publicly accessible files served via CloudFront
- **Versioning**: Disabled
- **Access**: Via CloudFront distribution only

### Tool Assets Bucket
- **Purpose**: Tool-specific assets like generated images and PDFs
- **Versioning**: Enabled
- **Lifecycle**: Cleanup old versions after 30 days
- **Access**: Authenticated users and CloudFront

## Monitoring and Alerts

### CloudWatch Dashboard
- Lambda function metrics (errors, duration, invocations)
- DynamoDB metrics (read/write capacity, throttling)
- SQS metrics (message counts, age)
- ElastiCache metrics (CPU, memory, connections)

### SNS Alerts
- Lambda function errors
- DynamoDB throttling
- SQS message age exceeding thresholds
- High error rates

## Cost Optimization

### Development Environment
- **DynamoDB**: On-demand billing
- **ElastiCache**: t3.micro instance
- **Lambda**: Minimal memory allocation
- **CloudFront**: Price class 100 (US, Canada, Europe)

### Production Environment
- **DynamoDB**: On-demand with auto-scaling
- **ElastiCache**: r6g.large with Multi-AZ
- **Lambda**: Optimized memory allocation
- **CloudFront**: Price class all

## Security Features

- **IAM Roles**: Least-privilege access for all services
- **Secrets Manager**: Secure storage of API keys and sensitive data
- **VPC**: ElastiCache deployed in private subnets
- **Encryption**: At-rest and in-transit encryption for all data
- **CORS**: Properly configured for web application access

## Troubleshooting

### Common Issues

1. **Lambda Build Failures**
   ```bash
   npm run clean
   npm run build-lambdas
   ```

2. **CDK Deployment Failures**
   ```bash
   cdk diff
   cdk deploy --verbose
   ```

3. **Permission Issues**
   - Ensure AWS credentials have sufficient permissions
   - Check IAM roles and policies in SecurityStack

4. **Resource Limits**
   - Check AWS service quotas
   - Monitor CloudWatch for throttling

### Useful Commands

```bash
# View CDK diff
cdk diff

# Synthesize CloudFormation templates
cdk synth

# Destroy all stacks (development only)
cdk destroy --all

# View stack outputs
aws cloudformation describe-stacks --stack-name Keyvex-development-Database

# Check Lambda logs
aws logs tail /aws/lambda/keyvex-ai-processor-development --follow
```

## Development Workflow

1. **Make Infrastructure Changes**
   ```bash
   # Edit CDK code
   npm run build
   cdk diff
   ```

2. **Update Lambda Functions**
   ```bash
   # Edit Lambda code
   npm run build-lambdas
   cdk deploy Keyvex-development-Compute
   ```

3. **Test Changes**
   ```bash
   # Check CloudWatch logs
   # Monitor metrics in dashboard
   # Test API endpoints
   ```

4. **Deploy to Production**
   ```bash
   npm run deploy-prod
   ```

## Support

For issues and questions:
1. Check CloudWatch logs for error details
2. Review AWS service quotas and limits
3. Verify IAM permissions and policies
4. Check the CDK documentation for updates

## License

This infrastructure code is part of the Keyvex platform and is proprietary. 