#!/usr/bin/env bash
# export-subscribers.sh — Dump all waitlist entries to subscribers.csv
# Usage: bash scripts/export-subscribers.sh
set -euo pipefail

STACK_NAME="OnyxStack"

TABLE_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query "StackResources[?ResourceType=='AWS::DynamoDB::Table'].PhysicalResourceId" \
  --output text)

echo "Scanning $TABLE_NAME..."

aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --query "Items[*].{email: email.S, full_name: full_name.S, neighborhood: neighborhood.S, created_at: created_at.S}" \
  --output json | python3 -c "
import json, sys, csv

data = json.load(sys.stdin)
if not data:
    print('No subscribers found.')
    sys.exit(0)

out = 'subscribers.csv'
with open(out, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['email', 'full_name', 'neighborhood', 'created_at'])
    w.writeheader()
    w.writerows(data)

print(f'Exported {len(data)} subscriber(s) to {out}')
"
