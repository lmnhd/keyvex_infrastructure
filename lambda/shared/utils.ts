import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { LambdaEnvironment, KeyvexTableItem, LambdaResponse } from './types';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// Environment variables helper
export function getEnvironment(): LambdaEnvironment {
  return {
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || '',
    REDIS_ENDPOINT: process.env.REDIS_ENDPOINT || '',
    REDIS_PORT: process.env.REDIS_PORT || '6379',
    AI_SECRETS_ARN: process.env.AI_SECRETS_ARN || '',
    INTEGRATIONS_SECRETS_ARN: process.env.INTEGRATIONS_SECRETS_ARN || '',
    DATABASE_SECRETS_ARN: process.env.DATABASE_SECRETS_ARN || '',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    AI_PROCESSING_QUEUE_URL: process.env.AI_PROCESSING_QUEUE_URL,
    ANALYTICS_QUEUE_URL: process.env.ANALYTICS_QUEUE_URL,
    EMAIL_QUEUE_URL: process.env.EMAIL_QUEUE_URL,
  };
}

// DynamoDB helpers
export class DynamoDBHelper {
  private tableName: string;

  constructor(tableName?: string) {
    this.tableName = tableName || getEnvironment().DYNAMODB_TABLE_NAME;
  }

  async getItem<T extends KeyvexTableItem>(PK: string, SK: string): Promise<T | null> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK },
      });

      const result = await docClient.send(command);
      return result.Item as T || null;
    } catch (error) {
      console.error('DynamoDB getItem error:', error);
      throw error;
    }
  }

  async putItem<T extends KeyvexTableItem>(item: T): Promise<void> {
    try {
      const now = Date.now();
      const itemWithTimestamps = {
        ...item,
        createdAt: item.createdAt || now,
        updatedAt: now,
        version: (item.version || 0) + 1,
      };

      const command = new PutCommand({
        TableName: this.tableName,
        Item: itemWithTimestamps,
      });

      await docClient.send(command);
    } catch (error) {
      console.error('DynamoDB putItem error:', error);
      throw error;
    }
  }

  async updateItem<T extends KeyvexTableItem>(
    PK: string,
    SK: string,
    updates: Partial<T>,
    conditionExpression?: string
  ): Promise<void> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      // Add updatedAt and increment version
      updates.updatedAt = Date.now();
      updates.version = (updates.version || 0) + 1;

      Object.entries(updates).forEach(([key, value], index) => {
        const nameKey = `#attr${index}`;
        const valueKey = `:val${index}`;
        
        updateExpressions.push(`${nameKey} = ${valueKey}`);
        expressionAttributeNames[nameKey] = key;
        expressionAttributeValues[valueKey] = value;
      });

      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: { PK, SK },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: conditionExpression,
      });

      await docClient.send(command);
    } catch (error) {
      console.error('DynamoDB updateItem error:', error);
      throw error;
    }
  }

  async deleteItem(PK: string, SK: string): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { PK, SK },
      });

      await docClient.send(command);
    } catch (error) {
      console.error('DynamoDB deleteItem error:', error);
      throw error;
    }
  }

  async query<T extends KeyvexTableItem>(
    PK: string,
    SKPrefix?: string,
    indexName?: string,
    limit?: number
  ): Promise<T[]> {
    try {
      let keyConditionExpression = 'PK = :pk';
      const expressionAttributeValues: Record<string, any> = { ':pk': PK };

      if (SKPrefix) {
        keyConditionExpression += ' AND begins_with(SK, :sk)';
        expressionAttributeValues[':sk'] = SKPrefix;
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false, // Sort in descending order
      });

      const result = await docClient.send(command);
      return result.Items as T[] || [];
    } catch (error) {
      console.error('DynamoDB query error:', error);
      throw error;
    }
  }

  async queryGSI<T extends KeyvexTableItem>(
    indexName: string,
    GSI_PK: string,
    GSI_SKPrefix?: string,
    limit?: number
  ): Promise<T[]> {
    try {
      let keyConditionExpression = 'GSI1PK = :gsi_pk';
      const expressionAttributeValues: Record<string, any> = { ':gsi_pk': GSI_PK };

      if (GSI_SKPrefix) {
        keyConditionExpression += ' AND begins_with(GSI1SK, :gsi_sk)';
        expressionAttributeValues[':gsi_sk'] = GSI_SKPrefix;
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false,
      });

      const result = await docClient.send(command);
      return result.Items as T[] || [];
    } catch (error) {
      console.error('DynamoDB queryGSI error:', error);
      throw error;
    }
  }
}

// Secrets Manager helper
export class SecretsHelper {
  private cache: Map<string, any> = new Map();

  async getSecret(secretArn: string): Promise<any> {
    if (this.cache.has(secretArn)) {
      return this.cache.get(secretArn);
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretArn,
      });

      const result = await secretsClient.send(command);
      const secret = JSON.parse(result.SecretString || '{}');
      
      // Cache for 5 minutes
      this.cache.set(secretArn, secret);
      setTimeout(() => this.cache.delete(secretArn), 5 * 60 * 1000);

      return secret;
    } catch (error) {
      console.error('Secrets Manager error:', error);
      throw error;
    }
  }

  async getAISecrets(): Promise<any> {
    const env = getEnvironment();
    return this.getSecret(env.AI_SECRETS_ARN);
  }

  async getIntegrationsSecrets(): Promise<any> {
    const env = getEnvironment();
    return this.getSecret(env.INTEGRATIONS_SECRETS_ARN);
  }

  async getDatabaseSecrets(): Promise<any> {
    const env = getEnvironment();
    return this.getSecret(env.DATABASE_SECRETS_ARN);
  }
}

// SQS helper
export class SQSHelper {
  async sendMessage(queueUrl: string, message: any, delaySeconds?: number): Promise<void> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: delaySeconds,
      });

      await sqsClient.send(command);
    } catch (error) {
      console.error('SQS sendMessage error:', error);
      throw error;
    }
  }

  async sendAIProcessingMessage(message: any): Promise<void> {
    const env = getEnvironment();
    if (!env.AI_PROCESSING_QUEUE_URL) {
      throw new Error('AI_PROCESSING_QUEUE_URL not configured');
    }
    await this.sendMessage(env.AI_PROCESSING_QUEUE_URL, message);
  }

  async sendAnalyticsMessage(message: any): Promise<void> {
    const env = getEnvironment();
    if (!env.ANALYTICS_QUEUE_URL) {
      throw new Error('ANALYTICS_QUEUE_URL not configured');
    }
    await this.sendMessage(env.ANALYTICS_QUEUE_URL, message);
  }

  async sendEmailMessage(message: any): Promise<void> {
    const env = getEnvironment();
    if (!env.EMAIL_QUEUE_URL) {
      throw new Error('EMAIL_QUEUE_URL not configured');
    }
    await this.sendMessage(env.EMAIL_QUEUE_URL, message);
  }
}

// Response helpers
export function createResponse(statusCode: number, body: any, headers?: Record<string, string>): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function createSuccessResponse(data: any): LambdaResponse {
  return createResponse(200, { success: true, data });
}

export function createErrorResponse(statusCode: number, message: string, error?: any): LambdaResponse {
  return createResponse(statusCode, {
    success: false,
    error: message,
    details: error?.message || error,
  });
}

// Utility functions
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getCurrentTimestamp(): number {
  return Date.now();
}

export function getTTL(daysFromNow: number): number {
  return Math.floor(Date.now() / 1000) + (daysFromNow * 24 * 60 * 60);
}

export function parseJSON(jsonString: string, defaultValue: any = null): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

// Logging helper
export function logInfo(message: string, data?: any): void {
  console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

export function logError(message: string, error?: any): void {
  console.error(`[ERROR] ${message}`, error);
}

export function logWarning(message: string, data?: any): void {
  console.warn(`[WARNING] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// Validation helpers
export function validateRequired(obj: any, requiredFields: string[]): void {
  const missingFields = requiredFields.filter(field => !obj[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Initialize shared instances
export const dynamoHelper = new DynamoDBHelper();
export const secretsHelper = new SecretsHelper();
export const sqsHelper = new SQSHelper(); 