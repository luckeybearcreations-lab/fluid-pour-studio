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
- `VITE_CLOUD_GALLERY` — leave unset. Set to `on` only once sign-in exists; without it every visitor shares one gallery.

## 2. Build and deploy
```powershell
cd "C:\Users\Michael\Documents\Codex\Projects\newfluidpourapp-webgl"
npm ci
npm run build
wrangler deploy --config dist/server/wrangler.json --name fluidpourstudio
```
The app is then live at the `fluidpourstudio` workers.dev address Wrangler prints.

## 3. Turn on Pro payments
Pro on the website is checked on the server, so it needs two secrets on the worker:
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

## 4. Turn on Google Play purchases (Android app)
In the Android app from Google Play, Pro is a one-time purchase handled by Google Play
(`src/lib/playBilling.ts`, `worker/pro.ts`). The website keeps using Stripe. It needs:

1. **The product.** Play Console → Lucky Bear Fluid Studio → Monetize with Play → Products →
   One-time products → create one with the product ID `pro_unlock`, price $4.99, and activate it.
   Play only offers this after a build with billing switched on has been uploaded (step 4).
2. **A service account**, so the worker can confirm purchases with Google:
   - Google Cloud Console → enable the "Google Play Android Developer API" → IAM → Service accounts →
     create one → Keys → Add key → JSON. Keep the downloaded file private.
   - Play Console → Users and permissions → Invite new users → the service account's email →
     for this app, allow "View financial data" and "Manage orders and subscriptions".
3. **The secret on the worker** (paste the whole JSON file when asked):
   ```powershell
   wrangler secret put GOOGLE_SERVICE_ACCOUNT --name fluidpourstudio
   ```
4. **An Android build with Play Billing switched on.** The Play app is
   `com.luckybearcreations.fluidstudio` ("Fluid Pour Studio: Lucky Bear"), packaged with PWABuilder
   from the live site with Google Play billing enabled. For each new build raise the version code,
   sign with the same upload key (`signing.keystore` from the first package: keep it and its
   passwords backed up and private), and upload the `.aab`.
5. **App links.** The worker serves `/.well-known/assetlinks.json` (`worker/index.ts`). After the
   first upload, copy the "App signing key" SHA-256 from Play Console → App integrity and add it to
   `PLAY_FINGERPRINTS`, or the app shows a browser address bar.

Until all of these are done, the Android app's Unlock button reports that the purchase couldn't finish.
Never show the Stripe link in the Play app: the code already hides it whenever Play Billing is present.

## 5. Custom domain (optional)
The app's home address is fluidpour.shopluckybears.com (`HOME_HOST` in `src/lib/useProSession.ts`). The older fluidpour.luckybears.org address still serves the app but sends visitors to the home address, because Pro is remembered per address. To serve it from another domain you own
(for example one in your Cloudflare account): Cloudflare Dashboard → Workers & Pages →
fluidpourstudio → Settings → Domains, then update `HOME_HOST` and the payment link redirect in step 3 to match.

## What's already done
- GPU paint engine (WebGL2), with the old particle engine as a fallback (see WEBGL_ENGINE.md)
- Paywall wired (Save + Export gated, free pouring always on), checked on the server
- Stripe link live: https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c
