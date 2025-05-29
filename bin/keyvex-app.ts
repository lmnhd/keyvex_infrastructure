#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { SecurityStack } from '../lib/security-stack';
import { StorageStack } from '../lib/storage-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ApiStack } from '../lib/api-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { UserBehaviorDynamoDBStack } from '../lib/user-behavior-dynamodb-stack';

const app = new cdk.App();

// Get environment context
const environment = app.node.tryGetContext('environment') || 'development';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

const env = { account, region };

// Stack naming convention
const stackPrefix = `Keyvex-${environment}`;

// Security Stack (must be first - contains secrets and IAM roles)
const securityStack = new SecurityStack(app, `${stackPrefix}-Security`, {
  env,
  environment,
  description: `Keyvex Security Stack - ${environment}`,
});

// Storage Stack (S3 buckets and CloudFront)
const storageStack = new StorageStack(app, `${stackPrefix}-Storage`, {
  env,
  environment,
  description: `Keyvex Storage Stack - ${environment}`,
});

// Database Stack (DynamoDB, ElastiCache, SQS)
const databaseStack = new DatabaseStack(app, `${stackPrefix}-Database`, {
  env,
  environment,
  description: `Keyvex Database Stack - ${environment}`,
});

// Compute Stack (Lambda functions)
const computeStack = new ComputeStack(app, `${stackPrefix}-Compute`, {
  env,
  environment,
  description: `Keyvex Compute Stack - ${environment}`,
  table: databaseStack.table,
  queues: databaseStack.queues,
  secrets: securityStack.secrets,
});

// API Stack (API Gateway, WebSocket)
const apiStack = new ApiStack(app, `${stackPrefix}-Api`, {
  env,
  environment,
  description: `Keyvex API Stack - ${environment}`,
  lambdaFunctions: computeStack.lambdaFunctions,
});

// Monitoring Stack (CloudWatch, Alarms, Dashboards)
const monitoringStack = new MonitoringStack(app, `${stackPrefix}-Monitoring`, {
  env,
  environment,
  description: `Keyvex Monitoring Stack - ${environment}`,
  table: databaseStack.table,
  queues: databaseStack.queues,
  lambdaFunctions: computeStack.lambdaFunctions,
  apiGateway: apiStack.apiGateway,
  webSocketApi: apiStack.webSocketApi,
});

// User Behavior DynamoDB Stack (independent - creates its own table)
const userBehaviorStack = new UserBehaviorDynamoDBStack(app, `${stackPrefix}-UserBehavior`, {
  env,
  description: `Keyvex User Behavior Tracking Stack - ${environment}`,
});

// Add stack dependencies
databaseStack.addDependency(securityStack);
computeStack.addDependency(databaseStack);
computeStack.addDependency(securityStack);
apiStack.addDependency(computeStack);
monitoringStack.addDependency(databaseStack);
monitoringStack.addDependency(computeStack);
monitoringStack.addDependency(apiStack);
userBehaviorStack.addDependency(databaseStack);
// Storage stack is independent and can be deployed in parallel

// Add tags to all stacks
const tags = {
  Project: 'Keyvex',
  Environment: environment,
  ManagedBy: 'CDK',
  CostCenter: 'Engineering',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// Output important values
new cdk.CfnOutput(securityStack, 'Environment', {
  value: environment,
  description: 'Deployment environment',
});

new cdk.CfnOutput(databaseStack, 'TableName', {
  value: databaseStack.table.tableName,
  description: 'DynamoDB table name',
  exportName: `${stackPrefix}-TableName`,
});

new cdk.CfnOutput(storageStack, 'CloudFrontDomain', {
  value: storageStack.storage.distribution.distributionDomainName,
  description: 'CloudFront distribution domain',
  exportName: `${stackPrefix}-CloudFrontDomain`,
}); 