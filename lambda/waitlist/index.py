import json
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.client("dynamodb")
ses = boto3.client("ses")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
TABLE_NAME = os.environ["TABLE_NAME"]
FROM_EMAIL = os.environ["FROM_EMAIL"]
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}


def respond(status_code: int, body: dict) -> dict:
    return {"statusCode": status_code, "headers": CORS, "body": json.dumps(body)}


def handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}
    if method != "POST":
        return respond(405, {"error": "Method not allowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON"})

    full_name    = (body.get("full_name") or "").strip()
    email        = (body.get("email") or "").strip()
    neighborhood = (body.get("neighborhood") or "").strip()

    missing = [k for k, v in [("full_name", full_name), ("email", email), ("neighborhood", neighborhood)] if not v]
    if missing:
        return respond(400, {"error": f"Missing required fields: {', '.join(missing)}"})
    if not EMAIL_RE.match(email):
        return respond(400, {"error": "Invalid email format"})

    email      = email.lower()
    first_name = full_name.split()[0]
    created_at = datetime.now(timezone.utc).isoformat()

    # ── DynamoDB insert ───────────────────────────────────────────────────────
    try:
        dynamodb.put_item(
            TableName=TABLE_NAME,
            Item={
                "email":        {"S": email},
                "full_name":    {"S": full_name},
                "neighborhood": {"S": neighborhood},
                "created_at":   {"S": created_at},
            },
            ConditionExpression="attribute_not_exists(email)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return respond(409, {"error": "This email is already on the waitlist"})
        print(f"DynamoDB error: {e}")
        return respond(500, {"error": "Something went wrong. Please try again."})

    # ── Confirmation email ────────────────────────────────────────────────────
    try:
        ses.send_email(
            Source=f"Onyx <{FROM_EMAIL}>",
            Destination={"ToAddresses": [email]},
            Message={
                "Subject": {"Data": "You're on the Onyx waitlist", "Charset": "UTF-8"},
                "Body": {
                    "Html": {
                        "Charset": "UTF-8",
                        "Data": f"""
                            <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#1C1C22;">
                                <h1 style="font-size:24px;color:#C5A55A;margin-bottom:16px;">Welcome, {first_name}!</h1>
                                <p style="font-size:16px;line-height:1.6;">
                                    You're officially on the Onyx waitlist. We're building the first credit card
                                    in Saudi Arabia that rewards your rent — and you'll be among the first to know
                                    when we launch.
                                </p>
                                <p style="font-size:16px;line-height:1.6;">
                                    We'll be in touch soon with updates. In the meantime, keep an eye on your inbox.
                                </p>
                                <p style="font-size:14px;color:#888;margin-top:32px;">— The Onyx Team</p>
                            </div>
                        """,
                    },
                },
            },
        )
    except Exception as e:
        print(f"SES confirmation email error: {e}")

    # ── Admin notification ────────────────────────────────────────────────────
    if NOTIFY_EMAIL:
        try:
            ses.send_email(
                Source=f"Onyx <{FROM_EMAIL}>",
                Destination={"ToAddresses": [NOTIFY_EMAIL]},
                Message={
                    "Subject": {"Data": f"New waitlist signup: {full_name}", "Charset": "UTF-8"},
                    "Body": {
                        "Text": {
                            "Charset": "UTF-8",
                            "Data": "\n".join([
                                "New waitlist signup:",
                                "",
                                f"Name:         {full_name}",
                                f"Email:        {email}",
                                f"Neighborhood: {neighborhood}",
                                f"Signed up at: {created_at}",
                            ]),
                        },
                    },
                },
            )
        except Exception as e:
            print(f"SES admin notification error: {e}")

    return respond(200, {"message": "You're on the waitlist!"})
