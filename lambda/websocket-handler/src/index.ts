
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const tableName = process.env.DYNAMODB_TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket event:', JSON.stringify(event, null, 2));

  const { connectionId, routeKey, stage, domainName } = event.requestContext;
  const callbackUrl = `https://${domainName}/${stage}`;

  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(connectionId!, event.queryStringParameters);
      
      case '$disconnect':
        return await handleDisconnect(connectionId!);
      
      case '$default':
        return await handleMessage(connectionId!, JSON.parse(event.body || '{}'), callbackUrl);
      
      default:
        return { statusCode: 400, body: 'Unknown route' };
    }
  } catch (error) {
    console.error('WebSocket handler error:', error);
    return { statusCode: 500, body: 'Internal server error' };
  }
};

async function handleConnect(connectionId: string, queryParams: any): Promise<APIGatewayProxyResult> {
  console.log(`Handling connection: ${connectionId}`);
  
  const userId = queryParams?.userId;
  const jobId = queryParams?.jobId;
  
  if (!userId) {
    return { statusCode: 400, body: 'Missing userId' };
  }

  // Store connection info in DynamoDB
  const connectionInfo = {
    PK: `CONNECTION#${connectionId}`,
    SK: `USER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `CONNECTION#${connectionId}`,
    connectionId,
    userId,
    jobId: jobId || null,
    connectedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours TTL
  };

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: connectionInfo,
  }));

  console.log(`Connection stored for user ${userId}`);
  return { statusCode: 200, body: 'Connected' };
}

async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResult> {
  console.log(`Handling disconnect: ${connectionId}`);
  
  // First get the connection info to find the SK
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `CONNECTION#${connectionId}`,
      },
    }));

    if (response.Items && response.Items.length > 0) {
      const item = response.Items[0];
      await docClient.send(new DeleteCommand({
        TableName: tableName,
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
      }));
    }
  } catch (error) {
    console.error('Error removing connection:', error);
  }

  console.log(`Connection ${connectionId} removed`);
  return { statusCode: 200, body: 'Disconnected' };
}

async function handleMessage(connectionId: string, message: any, callbackUrl: string): Promise<APIGatewayProxyResult> {
  console.log(`Handling message from ${connectionId}:`, message);
  
  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: callbackUrl,
  });

  try {
    await apiGwClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'echo',
        message: message,
        timestamp: new Date().toISOString(),
      }),
    }));
  } catch (error) {
    console.error('Failed to send message:', error);
    // Connection might be stale, remove it
    await handleDisconnect(connectionId);
  }

  return { statusCode: 200, body: 'Message sent' };
}

// Utility function to send progress updates to connected users
export async function emitStepProgress(
  userId: string,
  jobId: string,
  stepName: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  data?: any,
  domainName?: string,
  stage?: string
): Promise<void> {
  if (!domainName || !stage) {
    console.warn('WebSocket domain or stage not provided, skipping progress emission');
    return;
  }

  try {
    // Find active connections for this user
    const response = await docClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': `USER#${userId}`,
      },
    }));

    if (!response.Items || response.Items.length === 0) {
      console.log(`No active WebSocket connections found for user ${userId}`);
      return;
    }

    const callbackUrl = `https://${domainName}/${stage}`;
    const apiGwClient = new ApiGatewayManagementApiClient({
      endpoint: callbackUrl,
    });

    const progressMessage = {
      type: 'step_progress',
      jobId,
      stepName,
      status,
      data,
      timestamp: new Date().toISOString(),
    };

    // Send to all active connections for this user
    const sendPromises = response.Items.map(async (connection) => {
      try {
        await apiGwClient.send(new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: JSON.stringify(progressMessage),
        }));
        console.log(`Progress sent to connection ${connection.connectionId}`);
      } catch (error) {
        console.error(`Failed to send to connection ${connection.connectionId}:`, error);
        // Remove stale connection
        await handleDisconnect(connection.connectionId);
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (error) {
    console.error('Error emitting step progress:', error);
  }
}
