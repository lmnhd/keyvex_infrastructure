import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2Integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaFunctions } from './compute-stack';

export interface ApiStackProps extends cdk.StackProps {
  environment: string;
  lambdaFunctions: LambdaFunctions;
}

export class ApiStack extends cdk.Stack {
  public readonly apiGateway: apigateway.RestApi;
  public readonly webSocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { environment, lambdaFunctions } = props;

    // WebSocket API for real-time updates
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'KeyvexWebSocketApi', {
      apiName: `keyvex-websocket-api-${environment}`,
      description: `Keyvex WebSocket API - ${environment}`,
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          lambdaFunctions.websocketHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          lambdaFunctions.websocketHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          lambdaFunctions.websocketHandler
        ),
      },
    });

    // WebSocket Stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: environment === 'production' ? 'prod' : 'dev',
      autoDeploy: true,
    });

    // Note: WebSocket permissions will be granted in the compute stack to avoid circular dependencies

    // REST API Gateway (optional - for external integrations)
    this.apiGateway = new apigateway.RestApi(this, 'KeyvexRestApi', {
      restApiName: `keyvex-rest-api-${environment}`,
      description: `Keyvex REST API - ${environment}`,
      defaultCorsPreflightOptions: {
        allowOrigins: environment === 'production' 
          ? ['https://keyvex.com', 'https://www.keyvex.com']
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.webSocketApi.apiEndpoint,
      description: 'WebSocket API endpoint',
      exportName: `${environment}-WebSocketApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'RestApiEndpoint', {
      value: this.apiGateway.url,
      description: 'REST API endpoint',
      exportName: `${environment}-RestApiEndpoint`,
    });
  }
} 