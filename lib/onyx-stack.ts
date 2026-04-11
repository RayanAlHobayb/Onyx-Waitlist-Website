import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OnyxStackProps extends cdk.StackProps {
  fromEmail: string;
  notifyEmail: string;
  broadcastApiKey: string;
}

export class OnyxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OnyxStackProps) {
    super(scope, id, props);

    // ── DynamoDB ──────────────────────────────────────────────────────────────
    // RETAIN keeps subscriber data safe even on `cdk destroy`.
    const table = new dynamodb.Table(this, 'WaitlistTable', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Shared Lambda config ──────────────────────────────────────────────────
    const sharedEnv: Record<string, string> = {
      TABLE_NAME:   table.tableName,
      FROM_EMAIL:   props.fromEmail,
      NOTIFY_EMAIL: props.notifyEmail,
    };

    const sesPolicy = new iam.PolicyStatement({
      actions:   ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });

    // ── Lambda: waitlist signup ───────────────────────────────────────────────
    const waitlistFn = new lambda.Function(this, 'WaitlistFn', {
      runtime:      lambda.Runtime.PYTHON_3_12,
      code:         lambda.Code.fromAsset('lambda/waitlist'),
      handler:      'index.handler',
      memorySize:   128,
      timeout:      cdk.Duration.seconds(10),
      architecture: lambda.Architecture.ARM_64,
      environment:  sharedEnv,
    });
    table.grantWriteData(waitlistFn);
    waitlistFn.addToRolePolicy(sesPolicy);

    // ── Lambda: broadcast to all subscribers ──────────────────────────────────
    // 300 s timeout supports ~3 000 emails at 10/sec.
    const broadcastFn = new lambda.Function(this, 'BroadcastFn', {
      runtime:      lambda.Runtime.PYTHON_3_12,
      code:         lambda.Code.fromAsset('lambda/broadcast'),
      handler:      'index.handler',
      memorySize:   128,
      timeout:      cdk.Duration.seconds(300),
      architecture: lambda.Architecture.ARM_64,
      environment:  { ...sharedEnv, BROADCAST_API_KEY: props.broadcastApiKey },
    });
    table.grantReadData(broadcastFn);
    broadcastFn.addToRolePolicy(sesPolicy);

    // ── HTTP API Gateway ──────────────────────────────────────────────────────
    const api = new apigwv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'X-Api-Key'],
      },
    });

    api.addRoutes({
      path:        '/waitlist',
      methods:     [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('WaitlistInt', waitlistFn),
    });

    api.addRoutes({
      path:        '/broadcast',
      methods:     [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('BroadcastInt', broadcastFn),
    });

    // ── S3 Frontend Bucket ────────────────────────────────────────────────────
    // Private bucket — served exclusively through CloudFront.
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:     cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── CloudFront Distribution ───────────────────────────────────────────────
    // PriceClass.PRICE_CLASS_ALL includes Middle East edge locations.
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // ── Outputs (consumed by deploy.sh) ───────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url!.replace(/\/$/, ''),  // strip trailing slash
    });
    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${distribution.domainName}`,
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: bucket.bucketName,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    });
  }
}
