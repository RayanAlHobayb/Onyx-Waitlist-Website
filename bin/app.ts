#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OnyxStack } from '../lib/onyx-stack';

const app = new cdk.App();

// Context values are passed by deploy.sh via --context flags.
// Fallback to '' so `cdk bootstrap` (which doesn't deploy the stack) works without them.
new OnyxStack(app, 'OnyxStack', {
  fromEmail:       app.node.tryGetContext('fromEmail')       ?? '',
  notifyEmail:     app.node.tryGetContext('notifyEmail')     ?? '',
  broadcastApiKey: app.node.tryGetContext('broadcastApiKey') ?? '',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
