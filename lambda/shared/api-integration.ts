// Utility for integrating Next.js API route logic into Lambda functions

// Note: These types would be available when this file is copied to Lambda functions
// during the build process, as they have @types/aws-lambda installed

/**
 * Converts an API Gateway event to a format compatible with Next.js API routes
 */
export function apiGatewayEventToNextRequest(event: any): any {
  const host = event.headers?.Host || event.headers?.host || 'localhost';
  const url = new URL(event.path, `https://${host}`);
  
  // Add query parameters
  if (event.queryStringParameters) {
    Object.entries(event.queryStringParameters).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value as string);
    });
  }

  return {
    url: url.toString(),
    method: event.httpMethod,
    headers: new Headers(event.headers as Record<string, string>),
    // Note: body handling would need additional logic for different content types
  };
}

/**
 * Converts SQS message to a format that can be processed by API route logic
 */
export function sqsMessageToApiFormat(message: any) {
  return {
    body: message,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  };
}

/**
 * Wrapper to run Next.js API route handlers in Lambda context
 */
export async function runApiRouteInLambda<T = any>(
  handler: (req: any, context?: any) => Promise<T>,
  event: any, // APIGatewayProxyEvent | SQSEvent
  lambdaContext: any // Context
): Promise<T> {
  let apiRequest: any;

  if ('Records' in event) {
    // SQS Event
    const sqsRecord = event.Records[0];
    const messageBody = JSON.parse(sqsRecord.body);
    apiRequest = sqsMessageToApiFormat(messageBody);
  } else {
    // API Gateway Event
    apiRequest = apiGatewayEventToNextRequest(event);
  }

  // Add Lambda context for debugging
  apiRequest.lambdaContext = lambdaContext;

  return handler(apiRequest, lambdaContext);
}

/**
 * Helper to extract AI processing logic from API routes
 * This allows you to import the core logic from your Next.js API routes
 */
export interface AIProcessingContext {
  userId: string;
  sessionId: string;
  process: string;
  input: any;
  environment: 'lambda' | 'vercel';
}

/**
 * Adapter for AI processing functions
 */
export async function adaptAIProcessingFunction<T>(
  processingFunction: (context: AIProcessingContext) => Promise<T>,
  message: any,
  lambdaContext: any
): Promise<T> {
  const context: AIProcessingContext = {
    userId: message.userId,
    sessionId: message.sessionId,
    process: message.process,
    input: message.input,
    environment: 'lambda',
  };

  return processingFunction(context);
}

/**
 * Mock Next.js Response object for Lambda compatibility
 */
export class MockNextResponse {
  private _status = 200;
  private _headers = new Map<string, string>();
  private _body: any = null;

  status(code: number) {
    this._status = code;
    return this;
  }

  json(data: any) {
    this._body = data;
    this._headers.set('content-type', 'application/json');
    return this;
  }

  text(data: string) {
    this._body = data;
    this._headers.set('content-type', 'text/plain');
    return this;
  }

  setHeader(name: string, value: string) {
    this._headers.set(name.toLowerCase(), value);
    return this;
  }

  getApiGatewayResponse() {
    return {
      statusCode: this._status,
      headers: Object.fromEntries(this._headers),
      body: typeof this._body === 'string' ? this._body : JSON.stringify(this._body),
    };
  }
}

/**
 * Example usage pattern for importing API route logic:
 * 
 * ```typescript
 * // In your Lambda function:
 * import { magicSparkProcessor } from '../../../keyvex_app/src/app/api/ai/magic-spark/core-logic';
 * import { adaptAIProcessingFunction } from '../shared/api-integration';
 * 
 * export const handler = async (event: SQSEvent, context: Context) => {
 *   for (const record of event.Records) {
 *     const message = JSON.parse(record.body);
 *     
 *     const result = await adaptAIProcessingFunction(
 *       magicSparkProcessor,
 *       message,
 *       context
 *     );
 *     
 *     // Handle result...
 *   }
 * };
 * ```
 */ 