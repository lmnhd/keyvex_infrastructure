# Lambda Development Guide

## Overview

This guide explains how to develop and deploy Lambda functions for the Keyvex project using our automated build system that creates ZIP files for CDK deployment.

## Build System Features

### 1. Automated ZIP Creation
- ✅ Creates optimized ZIP files for each Lambda function
- ✅ Includes all dependencies and compiled TypeScript
- ✅ Generates build manifest for CDK deployment
- ✅ Handles shared utilities across all functions

### 2. Shared Code Management
- ✅ Copies shared utilities to each function during build
- ✅ Ensures consistent types and utilities across all Lambdas
- ✅ Automatic dependency management

### 3. API Route Integration
- ✅ Utilities to import Next.js API route logic into Lambda functions
- ✅ Adapters for converting Lambda events to API route format
- ✅ Mock response objects for compatibility

## Quick Start

### 1. Build All Lambda Functions
```bash
npm run build-lambdas
```

This will:
- Install dependencies for each function
- Copy shared utilities
- Compile TypeScript
- Create ZIP files
- Generate build manifest

### 2. Deploy Infrastructure
```bash
npm run deploy-dev    # For development
npm run deploy-prod   # For production
```

## Lambda Function Structure

Each Lambda function follows this structure:

```
lambda/
├── ai-processor/
│   ├── src/
│   │   └── index.ts          # Main handler
│   ├── dist/                 # Compiled output
│   ├── package.json          # Function dependencies
│   └── tsconfig.json         # TypeScript config
├── analytics-processor/
├── websocket-handler/
├── email-processor/
└── shared/                   # Shared utilities
    ├── types.ts              # Common types
    ├── utils.ts              # Helper functions
    └── api-integration.ts    # API route adapters
```

## Importing API Route Logic

### Step 1: Extract Core Logic from API Routes

In your Next.js API routes, separate the core logic:

```typescript
// keyvex_app/src/app/api/ai/magic-spark/core-logic.ts
export async function magicSparkProcessor(context: AIProcessingContext) {
  // Core AI processing logic here
  return result;
}

// keyvex_app/src/app/api/ai/magic-spark/route.ts
import { magicSparkProcessor } from './core-logic';

export async function POST(request: Request) {
  // Handle Vercel-specific logic
  const result = await magicSparkProcessor(context);
  return Response.json(result);
}
```

### Step 2: Import in Lambda Function

```typescript
// lambda/ai-processor/src/index.ts
import { SQSHandler } from 'aws-lambda';
import { adaptAIProcessingFunction } from '../shared/api-integration';
import { magicSparkProcessor } from '../../../keyvex_app/src/app/api/ai/magic-spark/core-logic';

export const handler: SQSHandler = async (event, context) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    
    if (message.process === 'magicSpark') {
      const result = await adaptAIProcessingFunction(
        magicSparkProcessor,
        message,
        context
      );
      // Handle result...
    }
  }
};
```

## Available Shared Utilities

### Types (`shared/types.ts`)
- `AIProcessingMessage` - SQS message format for AI processing
- `KeyvexTableItem` - Base DynamoDB item interface
- `UserItem`, `ToolItem`, `AISessionItem` - Entity types
- `LambdaEnvironment` - Environment variables interface

### Utils (`shared/utils.ts`)
- `DynamoDBHelper` - Database operations
- `SecretsHelper` - AWS Secrets Manager
- `SQSHelper` - Queue operations
- `getEnvironment()` - Environment variable parsing
- `parseJSON()` - Safe JSON parsing

### API Integration (`shared/api-integration.ts`)
- `adaptAIProcessingFunction()` - Adapt API route logic for Lambda
- `runApiRouteInLambda()` - Run Next.js handlers in Lambda
- `MockNextResponse` - Response object for compatibility

## Development Workflow

### 1. Develop API Routes First
- Create and test your AI processing logic in Next.js API routes
- Use the Vercel development server for rapid iteration
- Extract core logic into separate modules

### 2. Test Lambda Functions Locally
```bash
# Build functions
npm run build-lambdas

# Test individual function (example)
cd lambda/ai-processor
npm test
```

### 3. Deploy and Test
```bash
# Deploy to development environment
npm run deploy-dev

# Test with real AWS resources
# Monitor CloudWatch logs
```

## Environment Variables

Lambda functions automatically receive these environment variables:

```typescript
interface LambdaEnvironment {
  ENVIRONMENT: string;                    // 'dev' | 'prod'
  DYNAMODB_TABLE_NAME: string;           // Main table name
  REDIS_ENDPOINT: string;                // ElastiCache endpoint
  REDIS_PORT: string;                    // Redis port
  AI_SECRETS_ARN: string;                // AI API keys
  INTEGRATION_SECRETS_ARN: string;       // Third-party integrations
  DATABASE_SECRETS_ARN: string;          // Database encryption keys
  AI_PROCESSING_QUEUE_URL?: string;      // SQS queue URLs
  ANALYTICS_QUEUE_URL?: string;
  EMAIL_QUEUE_URL?: string;
}
```

## Best Practices

### 1. Error Handling
```typescript
export const handler: SQSHandler = async (event, context) => {
  const results = [];
  
  for (const record of event.Records) {
    try {
      await processMessage(record);
      results.push({ messageId: record.messageId, status: 'success' });
    } catch (error) {
      console.error('Failed to process message:', error);
      results.push({ 
        messageId: record.messageId, 
        status: 'error', 
        error: error.message 
      });
    }
  }
  
  return results;
};
```

### 2. Logging
```typescript
console.log('Processing started', { 
  requestId: context.awsRequestId,
  messageCount: event.Records.length 
});
```

### 3. Timeout Management
- AI Processor: 15 minutes (for complex AI chains)
- Analytics Processor: 5 minutes
- WebSocket Handler: 30 seconds
- Email Processor: 2 minutes

### 4. Memory Optimization
- AI Processor: 1024 MB (for AI model operations)
- Analytics Processor: 512 MB
- WebSocket Handler: 256 MB
- Email Processor: 256 MB

## Troubleshooting

### Build Issues
```bash
# Clean and rebuild
npm run clean
npm run build-lambdas
```

### Import Errors
- Ensure shared utilities are properly exported
- Check TypeScript compilation in individual function directories
- Verify build manifest includes all functions

### Deployment Issues
```bash
# Check CDK synthesis
npm run build

# Deploy with verbose logging
npm run deploy-dev -- --verbose
```

### Runtime Issues
- Check CloudWatch logs for each function
- Verify environment variables are set correctly
- Test DynamoDB and Redis connectivity

## Performance Monitoring

### CloudWatch Metrics
- Function duration and memory usage
- Error rates and success rates
- Queue message processing times

### Custom Metrics
- AI processing costs and token usage
- Database operation latency
- Cache hit rates

## Cost Optimization

### Lambda Optimization
- Use appropriate memory allocation
- Optimize cold start times
- Implement connection pooling for databases

### DynamoDB Optimization
- Use single-table design
- Implement proper GSI usage
- Monitor read/write capacity

### Redis Optimization
- Implement proper TTL for cached data
- Use appropriate cache eviction policies
- Monitor memory usage

## Next Steps

1. **Implement Core Logic**: Add your AI processing logic to each function
2. **Add Tests**: Create unit and integration tests
3. **Monitor Performance**: Set up CloudWatch dashboards
4. **Optimize Costs**: Monitor and optimize resource usage
5. **Scale**: Implement auto-scaling based on queue depth

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review this guide
3. Check the build manifest for compilation issues
4. Test locally before deploying 