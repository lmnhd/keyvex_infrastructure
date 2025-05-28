// Shared types for Lambda functions

export interface AIProcessingMessage {
  messageType: 'AI_PROCESSING';
  sessionId: string;
  userId: string;
  process: 'magicSpark' | 'logicArchitect' | 'contentCrafter' | 'styleMaster';
  input: any;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

export interface AnalyticsProcessingMessage {
  messageType: 'ANALYTICS_PROCESSING';
  toolId: string;
  interactionType: string;
  data: any;
  timestamp: number;
}

export interface EmailNotificationMessage {
  messageType: 'EMAIL_NOTIFICATION';
  userId: string;
  templateId: string;
  data: any;
  priority: 'high' | 'normal';
  timestamp: number;
}

export interface WebSocketMessage {
  action: 'connect' | 'disconnect' | 'message';
  connectionId: string;
  userId?: string;
  sessionId?: string;
  data?: any;
}

// DynamoDB Entity Types
export interface KeyvexTableItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  entityType: string;
  createdAt: number;
  updatedAt: number;
  ttl?: number;
  metadata: Record<string, any>;
  version: number;
  [key: string]: any;
}

export interface UserItem extends KeyvexTableItem {
  PK: `USER#${string}`;
  SK: 'PROFILE';
  GSI1PK: `EMAIL#${string}`;
  GSI1SK: 'USER';
  entityType: 'USER';
  clerkId: string;
  email: string;
  subscriptionTier: string;
  preferences: {
    defaultModels: Record<string, string>;
    debugMode: boolean;
    notifications: boolean;
  };
}

export interface ToolItem extends KeyvexTableItem {
  PK: `USER#${string}`;
  SK: `TOOL#${string}`;
  GSI1PK: `TOOL#${string}`;
  GSI1SK: `STATUS#${string}`;
  GSI2PK: `TYPE#${string}`;
  GSI2SK: `CREATED#${number}`;
  entityType: 'TOOL';
  toolId: string;
  userId: string;
  name: string;
  type: 'calculator' | 'quiz' | 'assessment';
  status: 'draft' | 'published' | 'archived';
  configuration: any;
  styling: any;
  analytics: {
    totalViews: number;
    totalCompletions: number;
    totalLeads: number;
    conversionRate: number;
    lastActivity: number;
  };
}

export interface AISessionItem extends KeyvexTableItem {
  PK: `SESSION#${string}`;
  SK: 'METADATA';
  GSI1PK: `USER#${string}`;
  GSI1SK: `SESSION#${number}`;
  entityType: 'SESSION';
  sessionId: string;
  userId: string;
  toolId?: string;
  currentStep: string;
  status: 'active' | 'completed' | 'abandoned';
  sessionData: {
    currentAgent: string;
    progress: number;
    totalSteps: number;
    modelUsage: Record<string, number>;
    totalCost: number;
  };
}

export interface ConversationMessageItem extends KeyvexTableItem {
  PK: `SESSION#${string}`;
  SK: `MESSAGE#${number}#${string}`;
  entityType: 'MESSAGE';
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agent?: string;
  modelUsed?: string;
  tokenCount?: number;
  cost?: number;
}

export interface LeadItem extends KeyvexTableItem {
  PK: `TOOL#${string}`;
  SK: `LEAD#${string}`;
  GSI1PK: `EMAIL#${string}`;
  GSI1SK: `LEAD#${number}`;
  entityType: 'LEAD';
  leadId: string;
  toolId: string;
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  responses: any;
  score?: number;
  resultCategory?: string;
  source: {
    referrer?: string;
    utm?: Record<string, string>;
    userAgent?: string;
  };
}

export interface ToolInteractionItem extends KeyvexTableItem {
  PK: `TOOL#${string}`;
  SK: `INTERACTION#${number}#${string}`;
  GSI1PK: `ANALYTICS#${string}`;
  GSI1SK: `${string}#${number}`;
  entityType: 'INTERACTION';
  toolId: string;
  interactionId: string;
  sessionId?: string;
  interactionType: 'view' | 'start' | 'complete' | 'abandon' | 'lead_capture' | 'share';
  interactionData?: {
    stepCompleted?: number;
    totalSteps?: number;
    timeSpent?: number;
    userAgent?: string;
    referrer?: string;
  };
}

export interface AIMetricItem extends KeyvexTableItem {
  PK: `METRIC#${string}`;
  SK: `REQUEST#${number}#${string}`;
  GSI1PK: `PROCESS#${string}`;
  GSI1SK: `${number}`;
  GSI2PK: `PROVIDER#${string}`;
  GSI2SK: `${number}`;
  entityType: 'METRIC';
  requestId: string;
  userId: string;
  process: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latency: number;
  success: boolean;
  error?: string;
  timestamp: number;
  ttl: number;
}

export interface AlertItem extends KeyvexTableItem {
  PK: `ALERT#${string}`;
  SK: 'ALERT';
  GSI1PK: `ALERT_TYPE#${string}`;
  GSI1SK: `${string}#${number}`;
  entityType: 'ALERT';
  alertId: string;
  type: 'cost' | 'performance' | 'error';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  data?: Record<string, any>;
  ttl: number;
}

export interface WebSocketConnectionItem extends KeyvexTableItem {
  PK: `CONNECTION#${string}`;
  SK: 'METADATA';
  GSI1PK: `USER#${string}`;
  GSI1SK: `CONNECTION#${number}`;
  entityType: 'CONNECTION';
  connectionId: string;
  userId: string;
  sessionId?: string;
  connectedAt: number;
  lastActivity: number;
  ttl: number;
}

// Environment variables interface
export interface LambdaEnvironment {
  ENVIRONMENT: string;
  DYNAMODB_TABLE_NAME: string;
  REDIS_ENDPOINT: string;
  REDIS_PORT: string;
  AI_SECRETS_ARN: string;
  INTEGRATIONS_SECRETS_ARN: string;
  DATABASE_SECRETS_ARN: string;
  AWS_REGION: string;
  AI_PROCESSING_QUEUE_URL?: string;
  ANALYTICS_QUEUE_URL?: string;
  EMAIL_QUEUE_URL?: string;
}

// Response types
export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface WebSocketResponse {
  statusCode: number;
  body?: string;
} 