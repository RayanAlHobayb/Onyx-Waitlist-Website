#!/usr/bin/env bash
# deploy.sh — Install deps, deploy CDK stack, upload frontend, invalidate CloudFront.
# Usage: bash scripts/deploy.sh
set -euo pipefail

# ── Load .env ─────────────────────────────────────────────────────────────────
if [ -f .env ]; then set -a; source .env; set +a; fi

: "${FROM_EMAIL:?Set FROM_EMAIL in .env (must be SES-verified)}"
: "${NOTIFY_EMAIL:?Set NOTIFY_EMAIL in .env}"
: "${BROADCAST_API_KEY:?Set BROADCAST_API_KEY in .env}"

# ── 1. Install CDK dependencies ───────────────────────────────────────────────
echo "==> npm install"
npm install --silent

# ── 2. Deploy CDK stack ───────────────────────────────────────────────────────
echo ""
echo "==> cdk deploy"
npx cdk deploy \
  --require-approval never \
  --outputs-file .cdk-outputs.json \
  --context "fromEmail=$FROM_EMAIL" \
  --context "notifyEmail=$NOTIFY_EMAIL" \
  --context "broadcastApiKey=$BROADCAST_API_KEY"

# ── 3. Parse outputs ──────────────────────────────────────────────────────────
echo ""
echo "==> Reading stack outputs..."
read_output() {
  python3 -c "import json; d=json.load(open('.cdk-outputs.json')); print(d['OnyxStack']['$1'])"
}

API_URL=$(read_output ApiUrl)
CF_URL=$(read_output WebsiteUrl)
BUCKET=$(read_output FrontendBucketName)
CF_ID=$(read_output CloudFrontDistributionId)

echo "  API    : $API_URL"
echo "  Website: $CF_URL"

# ── 4. Patch frontend — inject real API Gateway URL ───────────────────────────
echo ""
echo "==> Patching frontend/index.html with API URL..."
sed "s|__API_GATEWAY_URL__|${API_URL}|g" frontend/index.html > /tmp/index.html.deploy

# ── 5. Upload to S3 ───────────────────────────────────────────────────────────
echo "==> Uploading to s3://$BUCKET..."
aws s3 cp /tmp/index.html.deploy "s3://$BUCKET/index.html" \
  --content-type "text/html" \
  --cache-control "max-age=300, must-revalidate"

# ── 6. Invalidate CloudFront cache ────────────────────────────────────────────
echo "==> Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text

echo ""
echo "Deploy complete!"
echo "  Website : $CF_URL"
echo "  API     : $API_URL"
