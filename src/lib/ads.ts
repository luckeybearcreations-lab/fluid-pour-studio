/**
 * Google AdMob for the Android app.
 *
 * Free users see one small banner at the bottom of the screen. Pro removes it.
 * The website never loads this file.
 *
 * Until the real ids from the AdMob console are filled in below (and in
 * android/app/build.gradle), the app shows Google's test ads, which are safe
 * to tap and earn nothing.
 */
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
} from '@capacitor-community/admob';
import { hasPlayPro, onPlayProChanged } from '@/lib/playBilling';

/** Banner ad unit id from AdMob → Apps → Fluid Studio → Ad units. Empty = test ads. */
const BANNER_AD_UNIT_ID = '';
/** Google's sample banner unit: always fills, never pays. */
const TEST_BANNER_AD_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';

const testing = !BANNER_AD_UNIT_ID;
let started = false;

/** Leaves room for the banner so it never covers the studio's controls. */
const setBannerInset = (height: number) =>
  document.documentElement.style.setProperty('--ad-banner-height', `${Math.max(0, Math.round(height))}px`);

async function removeBanner(): Promise<void> {
  setBannerInset(0);
  await AdMob.removeBanner().catch(() => undefined);
}

/**
 * Starts ads for free users: asks for consent where the law requires it
 * (Google's consent form, EU/UK and some US states), then shows the banner.
 */
export async function startAds(): Promise<void> {
  if (started) return;
  started = true;
  onPlayProChanged(() => void removeBanner());
  if (await hasPlayPro()) return;

  try {
    await AdMob.initialize({ initializeForTesting: testing });

    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm();
    }
    if (!consent.canRequestAds) return;

    void AdMob.addListener(BannerAdPluginEvents.SizeChanged, size => setBannerInset(size.height));
    void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => setBannerInset(0));
    await AdMob.showBanner({
      adId: BANNER_AD_UNIT_ID || TEST_BANNER_AD_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting: testing,
    });
  } catch {
    // No ads is fine: the studio works the same without them.
    setBannerInset(0);
  }
}

/** True when this user must be offered a way to change their ad consent. */
export async function adPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdMob.requestConsentInfo();
    return info.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch {
    return false;
  }
}

/** Reopens Google's consent form so the user can change their ad choices. */
export function openAdPrivacyOptions(): void {
  void AdMob.showPrivacyOptionsForm().catch(() => undefined);
}
