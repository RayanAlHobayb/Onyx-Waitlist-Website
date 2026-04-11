# Onyx Waitlist — AWS Infrastructure

Serverless waitlist site for Onyx, built with AWS CDK (TypeScript) and Python Lambdas.

## Architecture

```
User browser
  │
  ├─► CloudFront ──► S3 (index.html)          Frontend
  │
  └─► API Gateway (HTTP) ──► Lambda (Python)
                                ├─► DynamoDB   (store subscriber)
                                └─► SES         (send emails)
```

| AWS Service | Purpose | Free tier |
|---|---|---|
| S3 | Static frontend hosting | 5 GB / 20 K GETs per month (12 mo) |
| CloudFront | HTTPS + global CDN (incl. Middle East PoPs) | 1 TB transfer / 10 M requests per month (12 mo) |
| API Gateway (HTTP) | Routes /waitlist and /broadcast | 1 M calls/month (12 mo), then $1/million |
| Lambda (Python 3.12) | Serverless backend | 1 M requests + 400 K GB-s **forever** |
| DynamoDB | Subscriber storage | 25 GB + 25 RCU/WCU **forever** |
| SES | Transactional email | $0.10 / 1 000 emails |

> **SES cost example:** 1,000 sign-ups = $0.10 total for all confirmation emails. Sending one broadcast to 1,000 people = $0.10.

---

## Prerequisites

1. **AWS CLI** configured (`aws configure`)
2. **Node.js 18+** (for CDK)
3. **AWS CDK CLI** — install once:
   ```bash
   npm install -g aws-cdk
   ```
4. **Install project dependencies** — run once after cloning:
   ```bash
   npm install
   ```
5. **CDK bootstrap** — run once per AWS account/region:
   ```bash
   cdk bootstrap
   ```
5. **Verified SES identity** — see First-time setup below

---

## First-time setup

### 1 — Verify your sender address in SES

> SES starts in **sandbox mode** — you can only send *to* verified addresses until you request production access.

**Quick (single address):**
```
AWS Console → SES → Verified identities → Create identity → Email address
```

**Better (whole domain):**
```
AWS Console → SES → Verified identities → Create identity → Domain
```
Add the DNS records SES provides. Takes ~5 minutes to propagate.

**Exit sandbox mode** (so you can send to anyone):
```
AWS Console → SES → Account dashboard → Request production access
```
AWS approves within a few hours to one business day.

### 2 — Create your `.env`

```bash
cp .env.example .env
```

Fill in `.env`:
```
FROM_EMAIL=hello@yourdomain.com       # must be SES-verified
NOTIFY_EMAIL=you@yourdomain.com       # must be SES-verified (while in sandbox)
BROADCAST_API_KEY=$(openssl rand -hex 32)
```

> `.env` is git-ignored. Never commit it.

---

## Deploy

```bash
bash scripts/deploy.sh
```

This will:
1. `npm install` — install CDK dependencies
2. `cdk deploy` — create/update all AWS resources
3. Inject the real API Gateway URL into `frontend/index.html`
4. Upload the patched HTML to S3
5. Invalidate the CloudFront cache

First deploy takes ~5 minutes (CloudFront distribution creation). Re-deploys take ~1 minute.

The script prints your website URL at the end.

---

## Re-deploying after changes

Everything — frontend changes, Lambda logic, infra changes — goes through the same command:

```bash
bash scripts/deploy.sh
```

---

## Broadcasting to your entire subscriber list

```bash
source .env

API_URL=$(python3 -c "import json; d=json.load(open('.cdk-outputs.json')); print(d['OnyxStack']['ApiUrl'])")

curl -X POST "$API_URL/broadcast" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $BROADCAST_API_KEY" \
  -d '{
    "subject": "Onyx is launching next month",
    "html": "<p>Hey, big news...</p>"
  }'
```

Response:
```json
{ "message": "Broadcast complete", "total": 847, "sent": 847, "failed": 0 }
```

> **Throughput:** ~10 emails/sec. A list of 1,000 takes ~2 min; 3,000 takes ~5 min (Lambda max). If your list grows beyond ~3,000 and you need faster delivery, the fix is SES bulk API or async fan-out — open an issue.

---

## Exporting subscribers to CSV

```bash
bash scripts/export-subscribers.sh
```

Creates `subscribers.csv` with columns: `email`, `full_name`, `neighborhood`, `created_at`.

---

## Viewing subscribers in the AWS Console

1. **DynamoDB** → **Tables** → `OnyxStack-WaitlistTable...`
2. Click **Explore table items**

---

## Tearing down

```bash
npx cdk destroy
```

> The DynamoDB table has `removalPolicy: RETAIN` — it survives `cdk destroy` so you never accidentally lose subscriber data. Delete it manually in the AWS Console if you really want to.

---

## Project structure

```
.
├── bin/
│   └── app.ts                CDK app entry point
├── lib/
│   └── onyx-stack.ts         CDK stack (all AWS resources defined here)
├── frontend/
│   └── index.html            Static website (__API_GATEWAY_URL__ replaced at deploy time)
├── lambda/
│   ├── waitlist/
│   │   └── index.py          POST /waitlist — save subscriber + send confirmation
│   └── broadcast/
│       └── index.py          POST /broadcast — send email to all subscribers
├── scripts/
│   ├── deploy.sh             Full deploy pipeline
│   └── export-subscribers.sh Export DynamoDB subscriber list to CSV
├── cdk.json                  CDK app config
├── package.json              CDK + TypeScript dependencies
├── tsconfig.json             TypeScript config
└── .env.example              Environment variable template
```
