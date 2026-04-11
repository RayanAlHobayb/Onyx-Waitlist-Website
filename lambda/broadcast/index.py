import json
import os
import time

import boto3

dynamodb = boto3.client("dynamodb")
ses = boto3.client("ses")

TABLE_NAME        = os.environ["TABLE_NAME"]
FROM_EMAIL        = os.environ["FROM_EMAIL"]
BROADCAST_API_KEY = os.environ["BROADCAST_API_KEY"]

CORS = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}


def respond(status_code: int, body: dict) -> dict:
    return {"statusCode": status_code, "headers": CORS, "body": json.dumps(body)}


def handler(event, _context):
    # ── Auth ──────────────────────────────────────────────────────────────────
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("x-api-key") != BROADCAST_API_KEY:
        return respond(401, {"error": "Unauthorized"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON"})

    subject = (body.get("subject") or "").strip()
    html    = (body.get("html") or "").strip()
    text    = (body.get("text") or "").strip()

    if not subject or (not html and not text):
        return respond(400, {"error": "subject and at least one of html or text are required"})

    # ── Paginated scan — fetch all subscribers ────────────────────────────────
    subscribers = []
    scan_kwargs: dict = {
        "TableName": TABLE_NAME,
        "ProjectionExpression": "email, full_name",
    }
    while True:
        resp = dynamodb.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            subscribers.append({"email": item["email"]["S"], "full_name": item["full_name"]["S"]})
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    if not subscribers:
        return respond(200, {"message": "No subscribers found", "sent": 0, "failed": 0})

    # ── Send emails at ~10/sec (well within SES production limits) ────────────
    msg_body: dict = {}
    if html:
        msg_body["Html"] = {"Charset": "UTF-8", "Data": html}
    if text:
        msg_body["Text"] = {"Charset": "UTF-8", "Data": text}

    sent = failed = 0
    for sub in subscribers:
        try:
            ses.send_email(
                Source=f"Onyx <{FROM_EMAIL}>",
                Destination={"ToAddresses": [sub["email"]]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": msg_body,
                },
            )
            sent += 1
        except Exception as e:
            print(f"Failed to send to {sub['email']}: {e}")
            failed += 1

        time.sleep(0.1)

    print(f"Broadcast complete — sent: {sent}, failed: {failed}, total: {len(subscribers)}")
    return respond(200, {
        "message": "Broadcast complete",
        "total":   len(subscribers),
        "sent":    sent,
        "failed":  failed,
    })
