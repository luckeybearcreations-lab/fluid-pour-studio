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
- `VITE_STRIPE_PAYMENT_LINK` — already set to `https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c`

## 2. Build and deploy
```powershell
cd "C:\Users\Michael\Documents\Codex\Projects\newfluidpourapp"
npm ci
npm run build
wrangler deploy --config dist/server/wrangler.json --name fluidpourstudio
```

## 3. Set the custom domain (optional but recommended)
In Cloudflare Dashboard → Workers & Pages → fluidpourstudio → Settings → Domains:
- Add `fluidpour.luckybears.org`

## 4. Update luckybears.org/fluidpour
Once deployed, update the APP_URL constant in:
  `C:\Users\Michael\Documents\Codex\luckybear-universe-hub\app\fluidpour\page.tsx`
Line 16: change `https://fluidpour.luckybears.org` to your actual deployed URL if different.

Then redeploy luckybears.org the same way.

## What's already done
- Physics engine improved (S-curve drying, material profiles, edge pooling, cells)
- Paywall wired (Save + Export gated, free pouring always on)
- Stripe link live: https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c
- Landing page at luckybears.org/fluidpour built and styled
