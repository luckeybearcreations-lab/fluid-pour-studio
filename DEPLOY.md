# Lucky Bear Fluid Pour Studio — Deploy Checklist

## Prerequisites
- Node >= 22 installed (`node --version`)
- Wrangler authenticated (`wrangler whoami` — same account as corbettstory)

## 1. Create your .env file
Copy the example and fill in Supabase (optional — saves fall back to local storage without it):
```
copy .env.example .env
```
Edit `.env`:
- `VITE_SUPABASE_URL` — your Supabase project URL (skip if not using cloud gallery yet)
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon key

## 2. Build and deploy
```powershell
cd "C:\Users\Michael\Documents\Codex\Projects\newfluidpourapp-webgl"
npm ci
npm run build
wrangler deploy --config dist/server/wrangler.json --name fluidpourstudio
```
The app is then live at the `fluidpourstudio` workers.dev address Wrangler prints.

## 3. Turn on Pro payments
Pro is checked on the server, so it needs two secrets on the worker:
```powershell
wrangler secret put STRIPE_SECRET_KEY --name fluidpourstudio
wrangler secret put PRO_TOKEN_SECRET --name fluidpourstudio
```
- `STRIPE_SECRET_KEY`: in Stripe → Developers → API keys, create a restricted key with
  **Read** access to Checkout Sessions and Subscriptions, and paste it.
- `PRO_TOKEN_SECRET`: any long random string (for example a password manager's 40-character password).

Then point the payment link back at the app. In Stripe → Payment links → "Lucky Bear Fluid Studio Pro"
(`https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c`) → Edit → After payment →
"Don't show confirmation page", redirect to:
```
https://<your app address>/?checkout={CHECKOUT_SESSION_ID}
```
Keep `{CHECKOUT_SESSION_ID}` exactly as written; Stripe fills it in. Without this step buyers
pay but land on Stripe's thank-you page and never get Pro.

Pro stays on in the browser it was bought in and is re-checked with Stripe once a day,
so a cancelled subscription loses Pro.

To try it locally with `wrangler dev`, put the same two values in `dist/server/.dev.vars`
(never commit that file).

## 4. Custom domain (optional)
luckybears.org is no longer used. To serve the app from another domain you own
(for example one in your Cloudflare account): Cloudflare Dashboard → Workers & Pages →
fluidpourstudio → Settings → Domains, then update the payment link redirect in step 3 to match.

## What's already done
- GPU paint engine (WebGL2), with the old particle engine as a fallback (see WEBGL_ENGINE.md)
- Paywall wired (Save + Export gated, free pouring always on), checked on the server
- Stripe link live: https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c
