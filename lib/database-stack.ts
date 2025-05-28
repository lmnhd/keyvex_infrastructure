import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  environment: string;
}

export interface QueueResources {
  aiProcessingQueue: sqs.Queue;
  aiProcessingDlq: sqs.Queue;
  analyticsQueue: sqs.Queue;
  analyticsDlq: sqs.Queue;
  emailQueue: sqs.Queue;
  emailDlq: sqs.Queue;
}

export class DatabaseStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly queues: QueueResources;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB Table with single-table design
    this.table = new dynamodb.Table(this, 'KeyvexMainTable', {
      tableName: `keyvex-main-table-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Global Secondary Index 1
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Global Secondary Index 2
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // SQS Dead Letter Queues
    const aiProcessingDlq = new sqs.Queue(this, 'AiProcessingDlq', {
      queueName: `keyvex-ai-processing-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const analyticsDlq = new sqs.Queue(this, 'AnalyticsDlq', {
      queueName: `keyvex-analytics-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const emailDlq = new sqs.Queue(this, 'EmailDlq', {
      queueName: `keyvex-email-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // SQS Main Queues
    const aiProcessingQueue = new sqs.Queue(this, 'AiProcessingQueue', {
      queueName: `keyvex-ai-processing-queue-${environment}`,
      visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: aiProcessingDlq,
        maxReceiveCount: 3,
      },
    });

    const analyticsQueue = new sqs.Queue(this, 'AnalyticsQueue', {
      queueName: `keyvex-analytics-queue-${environment}`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: analyticsDlq,
        maxReceiveCount: 5,
      },
    });

    const emailQueue = new sqs.Queue(this, 'EmailQueue', {
      queueName: `keyvex-email-queue-${environment}`,
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(3),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: emailDlq,
        maxReceiveCount: 3,
      },
    });

    this.queues = {
      aiProcessingQueue,
      aiProcessingDlq,
      analyticsQueue,
      analyticsDlq,
      emailQueue,
      emailDlq,
    };

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'DynamoDbTableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
      exportName: `${environment}-DynamoDbTableName`,
    });

    new cdk.CfnOutput(this, 'DynamoDbTableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB table ARN',
      exportName: `${environment}-DynamoDbTableArn`,
    });

    new cdk.CfnOutput(this, 'AiProcessingQueueUrl', {
      value: aiProcessingQueue.queueUrl,
      description: 'AI Processing Queue URL',
      exportName: `${environment}-AiProcessingQueueUrl`,
    });

    new cdk.CfnOutput(this, 'AiProcessingQueueArn', {
      value: aiProcessingQueue.queueArn,
      description: 'AI Processing Queue ARN',
      exportName: `${environment}-AiProcessingQueueArn`,
    });

    new cdk.CfnOutput(this, 'AnalyticsQueueUrl', {
      value: analyticsQueue.queueUrl,
      description: 'Analytics Queue URL',
      exportName: `${environment}-AnalyticsQueueUrl`,
    });

    new cdk.CfnOutput(this, 'AnalyticsQueueArn', {
      value: analyticsQueue.queueArn,
      description: 'Analytics Queue ARN',
      exportName: `${environment}-AnalyticsQueueArn`,
    });

    new cdk.CfnOutput(this, 'EmailQueueUrl', {
      value: emailQueue.queueUrl,
      description: 'Email Queue URL',
      exportName: `${environment}-EmailQueueUrl`,
    });

    new cdk.CfnOutput(this, 'EmailQueueArn', {
      value: emailQueue.queueArn,
      description: 'Email Queue ARN',
      exportName: `${environment}-EmailQueueArn`,
    });
  }
} 