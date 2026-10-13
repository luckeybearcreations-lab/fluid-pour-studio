/**
 * Google Play Billing for the Android app.
 *
 * Google Play requires apps it distributes to sell digital features through
 * Play Billing, so the Android build sells Pro as a Play subscription instead
 * of the Stripe link the website uses. Create it in Play Console under
 * Monetize → Subscriptions with these exact ids before testing a purchase.
 */
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';

export const PLAY_PRO_PRODUCT_ID = 'fluid_studio_pro';
export const PLAY_PRO_BASE_PLAN_ID = 'monthly';

const PRO_EVENT = 'lucky-bear-pro-changed';

/** True when Google Play reports an active Pro subscription on this device. */
export async function hasPlayPro(): Promise<boolean> {
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    return purchases.some(p => p.productIdentifier === PLAY_PRO_PRODUCT_ID && p.purchaseState === '1');
  } catch {
    return false;
  }
}

/** The localized price Google Play shows for Pro, if it can be read. */
export async function playProPrice(): Promise<string | null> {
  try {
    const { product } = await NativePurchases.getProduct({
      productIdentifier: PLAY_PRO_PRODUCT_ID,
      productType: PURCHASE_TYPE.SUBS,
    });
    return product?.priceString || null;
  } catch {
    return null;
  }
}

/** Opens Google Play's purchase sheet. Resolves true when Pro is unlocked. */
export async function buyPlayPro(): Promise<boolean> {
  await NativePurchases.purchaseProduct({
    productIdentifier: PLAY_PRO_PRODUCT_ID,
    planIdentifier: PLAY_PRO_BASE_PLAN_ID,
    productType: PURCHASE_TYPE.SUBS,
  });
  const active = await hasPlayPro();
  if (active) window.dispatchEvent(new Event(PRO_EVENT));
  return active;
}

export function openPlaySubscriptions(): void {
  void NativePurchases.manageSubscriptions().catch(() => undefined);
}

export function onPlayProChanged(listener: () => void): () => void {
  window.addEventListener(PRO_EVENT, listener);
  return () => window.removeEventListener(PRO_EVENT, listener);
}
