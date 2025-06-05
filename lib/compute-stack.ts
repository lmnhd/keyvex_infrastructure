import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { QueueResources } from './database-stack';
import { SecretsResources } from './security-stack';
import * as fs from 'fs';
import * as path from 'path';

export interface ComputeStackProps extends cdk.StackProps {
  environment: string;
  table: dynamodb.Table;
  queues: QueueResources;
  secrets: SecretsResources;
}

export interface LambdaFunctions {
  aiProcessor: lambda.Function;
  analyticsProcessor: lambda.Function;
  websocketHandler: lambda.Function;
  emailProcessor: lambda.Function;
}

interface BuildManifest {
  buildTime: string;
  functions: {
    [functionName: string]: {
      zipPath: string | null;
      success: boolean;
      error?: string;
    };
  };
}

export class ComputeStack extends cdk.Stack {
  public readonly lambdaFunctions: LambdaFunctions;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { environment, table, queues, secrets } = props;

    // Read build manifest to get ZIP file paths
    const manifestPath = path.join(__dirname, '..', 'dist', 'lambda', 'build-manifest.json');
    let buildManifest: BuildManifest | null = null;
    
    if (fs.existsSync(manifestPath)) {
      try {
        buildManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log('✅ Found Lambda build manifest');
      } catch (error) {
        console.warn('⚠️ Could not parse build manifest, using fallback asset paths');
      }
    } else {
      console.warn('⚠️ Build manifest not found, using fallback asset paths');
    }

    // Helper function to get Lambda code asset
    const getLambdaCode = (functionName: string): lambda.Code => {
      if (buildManifest?.functions[functionName]?.success && buildManifest.functions[functionName].zipPath) {
        const zipPath = buildManifest.functions[functionName].zipPath!;
        console.log(`📦 Using ZIP file for ${functionName}: ${zipPath}`);
        return lambda.Code.fromAsset(zipPath);
      } else {
        // Fallback to directory asset
        const fallbackPath = `lambda/${functionName}/dist`;
        console.log(`📁 Using directory asset for ${functionName}: ${fallbackPath}`);
        return lambda.Code.fromAsset(fallbackPath);
      }
    };

    // Common environment variables for all Lambda functions
    const commonEnvironment = {
      ENVIRONMENT: environment,
      DYNAMODB_TABLE_NAME: table.tableName,
      AI_SECRETS_ARN: secrets.aiSecrets.secretArn,
      INTEGRATION_SECRETS_ARN: secrets.integrationSecrets.secretArn,
      DATABASE_SECRETS_ARN: secrets.databaseSecrets.secretArn,
    };

    // AI Processor Lambda
    const aiProcessor = new lambda.Function(this, 'AiProcessor', {
      functionName: `keyvex-ai-processor-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/index.handler',
      code: getLambdaCode('ai-processor'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        ...commonEnvironment,
        AI_PROCESSING_QUEUE_URL: queues.aiProcessingQueue.queueUrl,
      },
    });

    // Analytics Processor Lambda
    const analyticsProcessor = new lambda.Function(this, 'AnalyticsProcessor', {
      functionName: `keyvex-analytics-processor-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/index.handler',
      code: getLambdaCode('analytics-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        ...commonEnvironment,
        ANALYTICS_QUEUE_URL: queues.analyticsQueue.queueUrl,
      },
    });

    // WebSocket Handler Lambda
    const websocketHandler = new lambda.Function(this, 'WebsocketHandler', {
      functionName: `keyvex-websocket-handler-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/index.handler',
      code: getLambdaCode('websocket-handler'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnvironment,
    });

    // Grant broad WebSocket API management permissions to the WebSocket handler
    // This avoids circular dependencies by not referencing the specific API
    websocketHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'execute-api:ManageConnections',
          'execute-api:Invoke'
        ],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:*`
        ],
      })
    );

    // Email Processor Lambda
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      functionName: `keyvex-email-processor-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/index.handler',
      code: getLambdaCode('email-processor'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        ...commonEnvironment,
        EMAIL_QUEUE_URL: queues.emailQueue.queueUrl,
      },
    });

    // Grant permissions to Lambda functions
    table.grantReadWriteData(aiProcessor);
    table.grantReadWriteData(analyticsProcessor);
    table.grantReadWriteData(websocketHandler);
    table.grantReadWriteData(emailProcessor);

    secrets.aiSecrets.grantRead(aiProcessor);
    secrets.aiSecrets.grantRead(analyticsProcessor);
    secrets.integrationSecrets.grantRead(emailProcessor);

    queues.aiProcessingQueue.grantConsumeMessages(aiProcessor);
    queues.analyticsQueue.grantConsumeMessages(analyticsProcessor);
    queues.emailQueue.grantConsumeMessages(emailProcessor);

    this.lambdaFunctions = {
      aiProcessor,
      analyticsProcessor,
      websocketHandler,
      emailProcessor,
    };

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'AiProcessorFunctionName', {
      value: aiProcessor.functionName,
      description: 'AI Processor Lambda function name',
      exportName: `${environment}-AiProcessorFunctionName`,
    });

    new cdk.CfnOutput(this, 'WebsocketHandlerFunctionName', {
      value: websocketHandler.functionName,
      description: 'WebSocket Handler Lambda function name',
      exportName: `${environment}-WebsocketHandlerFunctionName`,
    });

    // Output build information
    if (buildManifest) {
      new cdk.CfnOutput(this, 'LambdaBuildTime', {
        value: buildManifest.buildTime,
        description: 'Lambda functions build timestamp',
      });
    }
  }
} 