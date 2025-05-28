import { SQSHandler, SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { 
  DynamoDBHelper, 
  SecretsHelper, 
  SQSHelper, 
  getEnvironment, 
  parseJSON 
} from '../shared/utils';
import { 
  AIProcessingMessage, 
  ConversationMessageItem,
  KeyvexTableItem
} from '../shared/types';

const env = getEnvironment();
const dynamoHelper = new DynamoDBHelper(env.DYNAMODB_TABLE_NAME);
const secretsHelper = new SecretsHelper();
const sqsHelper = new SQSHelper();

export const handler: SQSHandler = async (event: SQSEvent, context: Context) => {
  console.log('AI Processor started', { 
    requestId: context.awsRequestId,
    messageCount: event.Records.length 
  });

  const results = [];

  for (const record of event.Records) {
    try {
      await processAIMessage(record);
      results.push({ messageId: record.messageId, status: 'success' });
    } catch (error) {
      console.error('Failed to process message:', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : error
      });
      results.push({ 
        messageId: record.messageId, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  console.log('AI Processor completed', { 
    requestId: context.awsRequestId,
    results 
  });

  return;
};

async function processAIMessage(record: SQSRecord): Promise<void> {
  const message: AIProcessingMessage = parseJSON(record.body);
  
  if (!message || message.messageType !== 'AI_PROCESSING') {
    throw new Error('Invalid message format');
  }

  console.log('Processing AI request:', {
    sessionId: message.sessionId,
    process: message.process,
    priority: message.priority
  });
  
  // TODO: Implement actual AI processing logic
  // This is where you would integrate with OpenAI, Anthropic, etc.
  
  // Simulate AI processing
  const processingResult = await simulateAIProcessing(message);
  
  // Update session in DynamoDB
  await updateAISession(message, processingResult);
  
  // Store conversation message
  await storeConversationMessage(message, processingResult);
  
  console.log('AI processing completed:', {
    sessionId: message.sessionId,
    process: message.process,
    success: processingResult.success
  });
}

async function simulateAIProcessing(message: AIProcessingMessage): Promise<any> {
  // TODO: Replace with actual AI provider integration
  const delay = Math.random() * 2000 + 1000; // 1-3 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return {
    success: true,
    process: message.process,
    result: `Processed ${message.process} for session ${message.sessionId}`,
    tokens: {
      input: Math.floor(Math.random() * 1000) + 100,
      output: Math.floor(Math.random() * 2000) + 200
    },
    latency: delay,
    timestamp: Date.now()
  };
}

async function updateAISession(message: AIProcessingMessage, result: any): Promise<void> {
  const updateData = {
    lastActivity: Date.now(),
    status: result.success ? 'completed' : 'failed',
    [`${message.process}Result`]: result,
    updatedAt: Date.now()
  };

  await dynamoHelper.updateItem(
    `USER#${message.userId}`, 
    `SESSION#${message.sessionId}`, 
    updateData
  );
}

async function storeConversationMessage(message: AIProcessingMessage, result: any): Promise<void> {
  const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = Date.now();
  
  const conversationMessage: KeyvexTableItem = {
    PK: `SESSION#${message.sessionId}`,
    SK: `MESSAGE#${timestamp}#${messageId}`,
    GSI1PK: `USER#${message.userId}`,
    GSI1SK: `MESSAGE#${timestamp}`,
    entityType: 'MESSAGE',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    metadata: {
      messageId,
      sessionId: message.sessionId,
      userId: message.userId,
      role: 'assistant',
      content: result.result,
      process: message.process,
      tokens: result.tokens,
      latency: result.latency,
      priority: message.priority,
      originalInput: message.input
    }
  };

  await dynamoHelper.putItem(conversationMessage);
}
