import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class UserBehaviorDynamoDBStack extends cdk.Stack {
  public readonly behaviorTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Main user behavior tracking table
    this.behaviorTable = new dynamodb.Table(this, 'UserBehaviorTable', {
      tableName: `keyvex-user-behavior-tracking-${props?.env?.account?.includes('prod') ? 'production' : 'development'}`,
      
      // Partition key: USER#userId
      // Sort key: INTERACTION#timestamp#interactionId OR PROFILE#CURRENT OR ANALYSIS#timestamp#analysisId
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK', 
        type: dynamodb.AttributeType.STRING
      },

      // Global Secondary Index for querying by interaction type and time
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: {
            name: 'GSI1PK',
            type: dynamodb.AttributeType.STRING
          },
          sortKey: {
            name: 'GSI1SK',
            type: dynamodb.AttributeType.NUMBER
          },
          projectionType: dynamodb.ProjectionType.ALL
        }
      ],

      // Billing mode and capacity
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // TTL for automatic data cleanup
      timeToLiveAttribute: 'TTL',
      
      // Point-in-time recovery for data protection
      pointInTimeRecovery: true,
      
      // Encryption at rest
      encryption: dynamodb.TableEncryption.AWS_MANAGED,

      // Deletion protection for production
      deletionProtection: true,

      // Stream for real-time processing
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,

      // Tags for cost allocation
      tags: {
        Service: 'Keyvex',
        Component: 'UserBehaviorTracking',
        Environment: props?.env?.account?.includes('prod') ? 'Production' : 'Development'
      }
    });

    // Create IAM role for Lambda functions accessing this table
    const behaviorTableAccessRole = new iam.Role(this, 'BehaviorTableAccessRole', {
      roleName: `keyvex-behavior-table-access-role-${props?.env?.account?.includes('prod') ? 'production' : 'development'}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // Grant read/write permissions to the table
    this.behaviorTable.grantReadWriteData(behaviorTableAccessRole);

    // Output important values
    new cdk.CfnOutput(this, 'BehaviorTableName', {
      value: this.behaviorTable.tableName,
      description: 'Name of the user behavior tracking table'
    });

    new cdk.CfnOutput(this, 'BehaviorTableArn', {
      value: this.behaviorTable.tableArn,
      description: 'ARN of the user behavior tracking table'
    });

    new cdk.CfnOutput(this, 'BehaviorTableStreamArn', {
      value: this.behaviorTable.tableStreamArn || '',
      description: 'Stream ARN for real-time behavior processing'
    });
  }
}

/**
 * DynamoDB Table Schema for User Behavior Tracking
 * 
 * Primary Key Pattern:
 * - PK: USER#{userId}
 * - SK: INTERACTION#{timestamp}#{interactionId} | PROFILE#CURRENT | ANALYSIS#{timestamp}#{analysisId}
 * 
 * GSI1 Pattern (for time-based queries):
 * - GSI1PK: INTERACTION#{interactionType} | ANALYSIS#{version}
 * - GSI1SK: {timestamp}
 * 
 * Item Types:
 * 
 * 1. User Interactions:
 *    PK: USER#user123
 *    SK: INTERACTION#1703123456789#int_abc123
 *    GSI1PK: INTERACTION#question_response
 *    GSI1SK: 1703123456789
 *    + all UserInteraction fields
 *    TTL: timestamp + 90 days (automatic cleanup)
 * 
 * 2. User Profile:
 *    PK: USER#user123
 *    SK: PROFILE#CURRENT
 *    + all UserProfile fields
 *    updatedAt: timestamp
 * 
 * 3. Analysis History:
 *    PK: USER#user123
 *    SK: ANALYSIS#1703123456789#analysis_xyz789
 *    GSI1PK: ANALYSIS#v1.1.0
 *    GSI1SK: 1703123456789
 *    + all AnalysisHistoryEntry fields
 * 
 * Query Patterns:
 * 
 * 1. Get all data for a user:
 *    PK = USER#user123
 * 
 * 2. Get recent interactions for a user:
 *    PK = USER#user123 AND SK begins_with INTERACTION#
 *    ScanIndexForward = false (latest first)
 * 
 * 3. Get user's current profile:
 *    PK = USER#user123 AND SK = PROFILE#CURRENT
 * 
 * 4. Get analysis history for a user:
 *    PK = USER#user123 AND SK begins_with ANALYSIS#
 *    ScanIndexForward = false (latest first)
 * 
 * 5. Query interactions by type across users (GSI1):
 *    GSI1PK = INTERACTION#question_response
 *    GSI1SK > timestamp_start AND GSI1SK < timestamp_end
 * 
 * 6. Query analyses by version across users (GSI1):
 *    GSI1PK = ANALYSIS#v1.1.0
 *    GSI1SK > timestamp_start AND GSI1SK < timestamp_end
 */ 