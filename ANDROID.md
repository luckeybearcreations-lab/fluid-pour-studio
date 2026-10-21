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
- **Free users see one AdMob banner** at the bottom (`src/lib/ads.ts`); Pro removes it. The app asks for ad
  consent with Google's consent form where the law requires it, and shows an "Ad choices" link in the footer
  for those users. It serves Google's test ads while `USE_TEST_ADS` in `src/lib/ads.ts` is true; set it to
  false for the production release.

## Building
GitHub Actions builds the app on every push (`.github/workflows/android.yml`):
- `fluid-studio-test-apk`: a test APK you can install on a phone straight away.
- `fluid-studio-play-bundle`: the signed `.aab` for Google Play. Built only when the repository secrets
  `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` exist (`ANDROID_KEY_ALIAS` defaults to `upload`,
  `ANDROID_KEY_PASSWORD` to the keystore password).

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

## AdMob (ads for free users)
1. Create the AdMob account at https://admob.google.com with the same Google account as Play Console.
2. Apps → Add app → Android → "Yes, it's listed" (search Fluid Studio). Copy the **app id** (`ca-app-pub-…~…`).
3. Ad units → Add → Banner. Copy the **ad unit id** (`ca-app-pub-…/…`).
4. Put the app id in `android/app/build.gradle` (`admobAppId`) and the ad unit id in `src/lib/ads.ts`
   (`BANNER_AD_UNIT_ID`). Done: app `ca-app-pub-7105602698632611~6253335508`, banner
   `ca-app-pub-7105602698632611/3651670009`. Keep `USE_TEST_ADS = true` through closed testing (never tap
   your own live ads) and flip it to false for production. The app was added to AdMob as "not listed"
   because closed-test apps aren't searchable; link it to Google Play in AdMob once it is in production.
5. Privacy & messaging → create a GDPR consent message (and a US states message) for the app and publish it.
6. Put `app-ads.txt` on the developer website from the Play listing
   (`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`).
7. Play Console → App content: change **Ads** to "Yes" and update **Data safety** from `store/play-listing.md`.
