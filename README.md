# Lucky Bear Fluid Studio

Local project name: `newfluidpourapp`

A fluid-art studio for the web and Android. It models wet acrylic paint with material-dependent viscosity, flow, cohesion, pigment interaction, silicone cells, drying, tilt, spin, layered recipes, an on-device gallery, and print-scale PNG export.

Live at https://fluidpour.luckybears.org (as of November 2026). Version numbers follow the Android build.

The pour system includes Ribbon, Splatter, Drip, Flip Cup, Dirty, Tree Ring, Dutch, Swipe, Open Cup, and Bloom techniques. Each cup layer can use its own amount, silicone ratio, and Fluid Acrylic, Heavy Body, Metallic, Pearl, Silicone Mix, Pouring Medium, or Gloss Medium behavior.

## Local development

```powershell
npm ci
npm run dev
```

Validation:

```powershell
npm run build
npm run lint
npm run typecheck
npm test
```

## How it fits together

- `app/`: the pages (the studio, `/privacy`, `/terms`).
- `src/`: the studio UI and both paint engines (see `WEBGL_ENGINE.md`).
- `worker/`: the Cloudflare worker. `worker/pro.ts` checks Pro subscriptions with Stripe.
- `public/`: icons, the web app manifest, and `sw.js` (offline support).

## Things to know

- Deploying is described in `DEPLOY.md`. Changes go through a pull request first.
- Pro is tied to the browser it was bought in. There is no sign-in yet.
- The cloud gallery is off (`VITE_CLOUD_GALLERY` unset) because without sign-in every visitor would share one list of pours. Pours are saved on the device.
- Subscribers cancel through the Stripe customer portal link in `STRIPE_PORTAL_URL` (`src/lib/useProSession.ts`), which uses the "Lucky Bear Fluid Studio" portal configuration in Stripe.
- `RECOVERY_PROVENANCE.md` and `FEATURE_CONSOLIDATION.md` record where this code came from.
