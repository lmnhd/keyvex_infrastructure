import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.StackProps {
  environment: string;
}

export interface SecretsResources {
  aiSecrets: secretsmanager.Secret;
  integrationSecrets: secretsmanager.Secret;
  databaseSecrets: secretsmanager.Secret;
}

export class SecurityStack extends cdk.Stack {
  public readonly secrets: SecretsResources;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // AI Provider Secrets
    const aiSecrets = new secretsmanager.Secret(this, 'AiSecrets', {
      secretName: `keyvex/ai/${environment}`,
      description: 'AI provider API keys and configuration',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          openai_api_key: '',
          anthropic_api_key: '',
          openai_organization: ''
        }),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\'
      },
    });

    // Integration Secrets
    const integrationSecrets = new secretsmanager.Secret(this, 'IntegrationSecrets', {
      secretName: `keyvex/integrations/${environment}`,
      description: 'Third-party integration secrets',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          unsplash_access_key: '',
          unsplash_secret_key: '',
          sendgrid_api_key: '',
          stripe_secret_key: ''
        }),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\'
      },
    });

    // Database Secrets
    const databaseSecrets = new secretsmanager.Secret(this, 'DatabaseSecrets', {
      secretName: `keyvex/database/${environment}`,
      description: 'Database encryption and access secrets',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          encryption_key: '',
          redis_auth_token: ''
        }),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\'
      },
    });

    this.secrets = {
      aiSecrets,
      integrationSecrets,
      databaseSecrets,
    };

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'AiSecretsArn', {
      value: aiSecrets.secretArn,
      description: 'AI secrets ARN',
      exportName: `${environment}-AiSecretsArn`,
    });

    new cdk.CfnOutput(this, 'IntegrationSecretsArn', {
      value: integrationSecrets.secretArn,
      description: 'Integration secrets ARN',
      exportName: `${environment}-IntegrationSecretsArn`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretsArn', {
      value: databaseSecrets.secretArn,
      description: 'Database secrets ARN',
      exportName: `${environment}-DatabaseSecretsArn`,
    });
  }
} 