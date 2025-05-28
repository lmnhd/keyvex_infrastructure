import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  environment: string;
}

export interface StorageResources {
  userUploadsBucket: s3.Bucket;
  publicAssetsBucket: s3.Bucket;
  toolAssetsBucket: s3.Bucket;
  distribution: cloudfront.Distribution;
}

export class StorageStack extends cdk.Stack {
  public readonly storage: StorageResources;
  public readonly uploadRole: iam.Role;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // User Uploads Bucket (private - for user uploaded files)
    const userUploadsBucket = new s3.Bucket(this, 'UserUploadsBucket', {
      bucketName: `keyvex-user-uploads-${environment}-${cdk.Stack.of(this).account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedOrigins: environment === 'production' 
            ? ['https://keyvex.com', 'https://www.keyvex.com']
            : ['http://localhost:3000', 'https://*.vercel.app'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Public Assets Bucket (for publicly accessible files like images, documents)
    const publicAssetsBucket = new s3.Bucket(this, 'PublicAssetsBucket', {
      bucketName: `keyvex-public-assets-${environment}-${cdk.Stack.of(this).account}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      publicReadAccess: false, // Will be accessed via CloudFront
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 86400, // 24 hours
        },
      ],
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Tool Assets Bucket (for tool-specific assets like generated images, PDFs)
    const toolAssetsBucket = new s3.Bucket(this, 'ToolAssetsBucket', {
      bucketName: `keyvex-tool-assets-${environment}-${cdk.Stack.of(this).account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'CleanupOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedOrigins: environment === 'production' 
            ? ['https://keyvex.com', 'https://www.keyvex.com']
            : ['http://localhost:3000', 'https://*.vercel.app'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // CloudFront Distribution for public assets
    const distribution = new cloudfront.Distribution(this, 'AssetsDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(publicAssetsBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      additionalBehaviors: {
        '/tool-assets/*': {
          origin: new origins.S3Origin(toolAssetsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        },
      },
      priceClass: environment === 'production' 
        ? cloudfront.PriceClass.PRICE_CLASS_ALL 
        : cloudfront.PriceClass.PRICE_CLASS_100,
      enabled: true,
      comment: `Keyvex Assets CDN - ${environment}`,
    });

    // IAM Role for file uploads (used by Next.js application)
    this.uploadRole = new iam.Role(this, 'FileUploadRole', {
      roleName: `keyvex-file-upload-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for handling file uploads to S3',
    });

    // S3 Upload Policies
    const userUploadsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        userUploadsBucket.bucketArn,
        `${userUploadsBucket.bucketArn}/*`,
      ],
      conditions: {
        StringLike: {
          's3:x-amz-content-sha256': '*',
        },
      },
    });

    const toolAssetsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        toolAssetsBucket.bucketArn,
        `${toolAssetsBucket.bucketArn}/*`,
      ],
    });

    const publicAssetsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        publicAssetsBucket.bucketArn,
        `${publicAssetsBucket.bucketArn}/*`,
      ],
    });

    // Add policies to upload role
    this.uploadRole.addToPolicy(userUploadsPolicy);
    this.uploadRole.addToPolicy(toolAssetsPolicy);
    this.uploadRole.addToPolicy(publicAssetsPolicy);

    this.storage = {
      userUploadsBucket,
      publicAssetsBucket,
      toolAssetsBucket,
      distribution,
    };

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'UserUploadsBucketName', {
      value: userUploadsBucket.bucketName,
      description: 'User uploads S3 bucket name',
      exportName: `${environment}-UserUploadsBucketName`,
    });

    new cdk.CfnOutput(this, 'PublicAssetsBucketName', {
      value: publicAssetsBucket.bucketName,
      description: 'Public assets S3 bucket name',
      exportName: `${environment}-PublicAssetsBucketName`,
    });

    new cdk.CfnOutput(this, 'ToolAssetsBucketName', {
      value: toolAssetsBucket.bucketName,
      description: 'Tool assets S3 bucket name',
      exportName: `${environment}-ToolAssetsBucketName`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${environment}-CloudFrontDomain`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${environment}-CloudFrontDistributionId`,
    });

    new cdk.CfnOutput(this, 'FileUploadRoleArn', {
      value: this.uploadRole.roleArn,
      description: 'File upload role ARN',
      exportName: `${environment}-FileUploadRoleArn`,
    });
  }
} 