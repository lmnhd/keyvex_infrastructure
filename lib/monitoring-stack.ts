import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { QueueResources } from './database-stack';
import { LambdaFunctions } from './compute-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  environment: string;
  table: dynamodb.Table;
  queues: QueueResources;
  lambdaFunctions: LambdaFunctions;
  apiGateway: apigateway.RestApi;
  webSocketApi: apigatewayv2.WebSocketApi;
}

export class MonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment, table, queues, lambdaFunctions, apiGateway, webSocketApi } = props;

    // SNS Topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `keyvex-alerts-${environment}`,
      displayName: 'Keyvex Platform Alerts',
    });

    // Email subscription for alerts (replace with actual email)
    this.alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('admin@keyvex.com')
    );

    // DynamoDB Alarms
    const dynamoReadThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoReadThrottleAlarm', {
      alarmName: `keyvex-dynamo-read-throttle-${environment}`,
      alarmDescription: 'DynamoDB read throttle events detected',
      metric: table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN],
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dynamoReadThrottleAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const dynamoWriteThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoWriteThrottleAlarm', {
      alarmName: `keyvex-dynamo-write-throttle-${environment}`,
      alarmDescription: 'DynamoDB write throttle events detected',
      metric: table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM],
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dynamoWriteThrottleAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // Lambda Function Alarms
    Object.entries(lambdaFunctions).forEach(([name, lambdaFunction]) => {
      // Error rate alarm
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `keyvex-lambda-${name}-errors-${environment}`,
        alarmDescription: `High error rate for ${name} Lambda function`,
        metric: lambdaFunction.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
      errorAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

      // Duration alarm (80% of timeout)
      const timeoutThreshold = lambdaFunction.timeout ? 
        lambdaFunction.timeout.toMilliseconds() * 0.8 : 
        30000; // Default 30 seconds * 0.8

      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `keyvex-lambda-${name}-duration-${environment}`,
        alarmDescription: `High duration for ${name} Lambda function`,
        metric: lambdaFunction.metricDuration({
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: timeoutThreshold,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
      durationAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));
    });

    // SQS Queue Alarms
    // Dead letter queue alarms
    const dlqAlarm1 = new cloudwatch.Alarm(this, 'AiProcessingDlqAlarm', {
      alarmName: `keyvex-sqs-ai-processing-dlq-messages-${environment}`,
      alarmDescription: 'Messages in AI processing dead letter queue',
      metric: queues.aiProcessingDlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dlqAlarm1.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const dlqAlarm2 = new cloudwatch.Alarm(this, 'AnalyticsDlqAlarm', {
      alarmName: `keyvex-sqs-analytics-dlq-messages-${environment}`,
      alarmDescription: 'Messages in analytics dead letter queue',
      metric: queues.analyticsDlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dlqAlarm2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const dlqAlarm3 = new cloudwatch.Alarm(this, 'EmailDlqAlarm', {
      alarmName: `keyvex-sqs-email-dlq-messages-${environment}`,
      alarmDescription: 'Messages in email dead letter queue',
      metric: queues.emailDlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dlqAlarm3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // Main queue backlog alarms
    const backlogAlarm1 = new cloudwatch.Alarm(this, 'AiProcessingBacklogAlarm', {
      alarmName: `keyvex-sqs-ai-processing-backlog-${environment}`,
      alarmDescription: 'High message backlog in AI processing queue',
      metric: queues.aiProcessingQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    backlogAlarm1.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const backlogAlarm2 = new cloudwatch.Alarm(this, 'AnalyticsBacklogAlarm', {
      alarmName: `keyvex-sqs-analytics-backlog-${environment}`,
      alarmDescription: 'High message backlog in analytics queue',
      metric: queues.analyticsQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    backlogAlarm2.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const backlogAlarm3 = new cloudwatch.Alarm(this, 'EmailBacklogAlarm', {
      alarmName: `keyvex-sqs-email-backlog-${environment}`,
      alarmDescription: 'High message backlog in email queue',
      metric: queues.emailQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 25,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    backlogAlarm3.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // API Gateway Alarms
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiGatewayErrorAlarm', {
      alarmName: `keyvex-api-gateway-errors-${environment}`,
      alarmDescription: 'High error rate in API Gateway',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: apiGateway.restApiName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    apiErrorAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // WebSocket API Alarms
    const wsErrorAlarm = new cloudwatch.Alarm(this, 'WebSocketErrorAlarm', {
      alarmName: `keyvex-websocket-errors-${environment}`,
      alarmDescription: 'High error rate in WebSocket API',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGatewayV2',
        metricName: '4XXError',
        dimensionsMap: {
          ApiId: webSocketApi.apiId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    wsErrorAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // Custom Metrics for AI Operations (these will be published by the application)
    const aiCostAlarm = new cloudwatch.Alarm(this, 'AiCostAlarm', {
      alarmName: `keyvex-ai-cost-${environment}`,
      alarmDescription: 'High AI operation costs',
      metric: new cloudwatch.Metric({
        namespace: 'Keyvex/AI',
        metricName: 'TotalCost',
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      }),
      threshold: environment === 'production' ? 100 : 10, // $100 for prod, $10 for dev
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    aiCostAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    const aiLatencyAlarm = new cloudwatch.Alarm(this, 'AiLatencyAlarm', {
      alarmName: `keyvex-ai-latency-${environment}`,
      alarmDescription: 'High AI operation latency',
      metric: new cloudwatch.Metric({
        namespace: 'Keyvex/AI',
        metricName: 'AverageLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    aiLatencyAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alertTopic));

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'KeyvexDashboard', {
      dashboardName: `keyvex-dashboard-${environment}`,
    });

    // AI Operations Dashboard Section
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'AI Operations - Cost',
        left: [
          new cloudwatch.Metric({
            namespace: 'Keyvex/AI',
            metricName: 'TotalCost',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'AI Operations - Latency',
        left: [
          new cloudwatch.Metric({
            namespace: 'Keyvex/AI',
            metricName: 'AverageLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Lambda Functions Dashboard Section
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Functions - Invocations',
        left: Object.values(lambdaFunctions).map(fn => fn.metricInvocations()),
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Functions - Errors',
        left: Object.values(lambdaFunctions).map(fn => fn.metricErrors()),
        width: 12,
        height: 6,
      })
    );

    // DynamoDB Dashboard Section
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Read/Write Capacity',
        left: [
          table.metricConsumedReadCapacityUnits(),
          table.metricConsumedWriteCapacityUnits(),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Throttles',
        left: [
          table.metricThrottledRequestsForOperations({
            operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY],
          }),
          table.metricThrottledRequestsForOperations({
            operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM],
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // SQS Dashboard Section
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SQS Queues - Message Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.aiProcessingQueue.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.analyticsQueue.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.emailQueue.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.aiProcessingDlq.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.analyticsDlq.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: { QueueName: queues.emailDlq.queueName },
            statistic: 'Average',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'SQS Queues - Message Age',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateAgeOfOldestMessage',
            dimensionsMap: { QueueName: queues.aiProcessingQueue.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateAgeOfOldestMessage',
            dimensionsMap: { QueueName: queues.analyticsQueue.queueName },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateAgeOfOldestMessage',
            dimensionsMap: { QueueName: queues.emailQueue.queueName },
            statistic: 'Average',
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // API Gateway Dashboard Section
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: apiGateway.restApiName },
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'WebSocket API - Connections',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGatewayV2',
            metricName: 'ConnectCount',
            dimensionsMap: { ApiId: webSocketApi.apiId },
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS topic ARN for alerts',
      exportName: `${environment}-AlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch dashboard URL',
      exportName: `${environment}-DashboardUrl`,
    });
  }
} 