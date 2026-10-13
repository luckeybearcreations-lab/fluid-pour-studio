# Android app (Google Play)

The Android app is the same studio wrapped with [Capacitor](https://capacitorjs.com).
It runs fully offline from files inside the app.

- App id: `com.luckybear.fluidstudio`
- Web build for the app: `vite.android.config.ts` → `dist-android/` (the website still uses `vite.config.ts`)
- Native project: `android/`
- Store text, icon, feature graphic, screenshots: `store/`
- Privacy policy page: `public/privacy.html` (served at `/privacy.html` on the website)

## What's different from the website
- **Pro is a Google Play subscription** (`src/lib/playBilling.ts`), not the Stripe link.
  Google Play requires apps it distributes to sell digital features through Play Billing.
  Product id `fluid_studio_pro`, base plan `monthly`. Create it in Play Console before testing a purchase;
  purchases only work in a copy installed from Play (internal testing is enough).
- **Saving files opens the share sheet** (`src/lib/native.ts`), because download links do nothing inside an app.
- No service worker (the files are already in the app).

## Building
GitHub Actions builds the app on every push (`.github/workflows/android.yml`):
- `fluid-studio-test-apk`: a test APK you can install on a phone straight away.
- `fluid-studio-play-bundle`: the signed `.aab` for Google Play. Built only when these repository secrets exist:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

The upload key lives outside the repo (never commit it). Keep a backup: if it is lost,
Play support can reset the upload key, but it takes days.

Local build (needs Android Studio / the Android SDK):
```
npm ci
npm run build:android
cd android && ./gradlew assembleDebug
```

## Publishing checklist
1. Google Play developer account (one-time $25) at https://play.google.com/console/signup
2. Create app → "Lucky Bear Fluid Studio", App, Free.
3. Fill the listing and App content forms from `store/play-listing.md`.
4. Monetize → Subscriptions → create `fluid_studio_pro` with base plan `monthly`.
5. Testing → Internal testing → upload the `.aab` from the latest Actions run, add your email as a tester.
6. New personal developer accounts must run a closed test (12 testers for 14 days) before Production.
7. Production → upload the same `.aab` → send for review.
