# Onyx — Backend API

Serverless API powered by [Vercel Functions](https://vercel.com/docs/functions), [Supabase](https://supabase.com), [Resend](https://resend.com), and [Mailchimp](https://mailchimp.com).

## Environment Variables

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

| Variable | Required | Where to find it |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase dashboard → **Settings → API → Project URL** |
| `SUPABASE_ANON_KEY` | Yes | Supabase dashboard → **Settings → API → Project API keys → anon / public** |
| `RESEND_API_KEY` | Yes | [resend.com/api-keys](https://resend.com/api-keys) — create a new key |
| `FROM_EMAIL` | No | Sender address (default: `hello@yourdomain.com`). Must be on a [verified Resend domain](https://resend.com/domains) |
| `NOTIFY_EMAIL` | No | Your personal email to receive new-signup notifications. If omitted, no admin notification is sent |
| `MAILCHIMP_API_KEY` | Yes | [mailchimp.com/account/api](https://mailchimp.com/account/api) — generate a new key |
| `MAILCHIMP_SERVER_PREFIX` | Yes | The `usX` prefix in your Mailchimp API URL (e.g. `us21`). Visible in the URL when logged into Mailchimp |
| `MAILCHIMP_LIST_ID` | Yes | Mailchimp → **Audience → Settings → Audience name and defaults → Audience ID** |

## Setting Up on Vercel

1. **Install the Vercel CLI** (if you haven't already):

   ```bash
   npm i -g vercel
   ```

2. **Link your project**:

   ```bash
   vercel link
   ```

3. **Add each environment variable** via the CLI:

   ```bash
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_ANON_KEY
   vercel env add RESEND_API_KEY
   vercel env add FROM_EMAIL
   vercel env add NOTIFY_EMAIL
   vercel env add MAILCHIMP_API_KEY
   vercel env add MAILCHIMP_SERVER_PREFIX
   vercel env add MAILCHIMP_LIST_ID
   ```

   Each command will prompt you to enter the value and select which environments it applies to (Production, Preview, Development).

   Alternatively, add them in the Vercel dashboard: **Project → Settings → Environment Variables**.

4. **Deploy**:

   ```bash
   vercel            # preview deployment
   vercel --prod     # production deployment
   ```

## Local Development

```bash
npm install
npm run dev        # starts vercel dev on http://localhost:3000
```

The `vercel dev` command automatically reads your `.env` file.

## API Endpoints

### `POST /api/waitlist`

Add a user to the waitlist.

**Request body** (JSON):

```json
{
  "full_name": "Ahmad Al-Rashid",
  "email": "ahmad@example.com",
  "neighborhood": "Al Olaya"
}
```

**Responses:**

| Status | Meaning |
|---|---|
| `200` | Signup successful |
| `400` | Missing fields or invalid email |
| `405` | Wrong HTTP method (only POST allowed) |
| `409` | Email already on the waitlist |
| `500` | Server error |
