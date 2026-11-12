/**
 * Google Play Billing for the Android app.
 *
 * Inside the app installed from Google Play, the browser exposes the Digital
 * Goods API. Pro is then a one-time purchase handled by Google Play instead of
 * Stripe: Play shows the payment sheet, and the worker (worker/pro.ts) checks
 * the purchase with Google before unlocking Pro. Everywhere else (the website,
 * a desktop install) this service is missing and the app uses Stripe.
 */
const PLAY_METHOD = 'https://play.google.com/billing';
/** The one-time product created in Play Console → Monetize with Play → Products → One-time products. */
export const PLAY_PRODUCT_ID = 'pro_unlock';

interface ItemDetails { itemId: string; title: string; price: { currency: string; value: string } }
interface PurchaseDetails { itemId: string; purchaseToken: string }
interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}
declare global {
  interface Window { getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService> }
}

let service: Promise<DigitalGoodsService | null> | null = null;

/** The Play Billing service, or null outside the Google Play app. */
export function playService(): Promise<DigitalGoodsService | null> {
  service ??= (async () => {
    if (typeof window === 'undefined' || !window.getDigitalGoodsService) return null;
    try { return await window.getDigitalGoodsService(PLAY_METHOD); } catch { return null; }
  })();
  return service;
}

/** The price Google Play will charge, formatted for the buyer's country. */
export async function playPrice(): Promise<string | null> {
  const play = await playService();
  if (!play) return null;
  try {
    const [item] = await play.getDetails([PLAY_PRODUCT_ID]);
    if (!item) return null;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: item.price.currency }).format(Number(item.price.value));
  } catch { return null; }
}

/** Hands a purchase to the worker, which confirms it with Google and unlocks Pro. */
async function redeem(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/pro/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as { pro?: boolean };
    return Boolean(data.pro);
  } catch { return false; }
}

/** Unlocks Pro if this Google account already bought it (new phone, reinstall, cleared data). */
export async function restorePlayPurchase(): Promise<boolean> {
  const play = await playService();
  if (!play) return false;
  try {
    const owned = (await play.listPurchases()).find(p => p.itemId === PLAY_PRODUCT_ID);
    return owned ? redeem(owned.purchaseToken) : false;
  } catch { return false; }
}

/** Opens Google Play's payment sheet for the one-time Pro unlock. */
export async function buyPlayUnlock(): Promise<'bought' | 'cancelled' | 'failed'> {
  if (!(await playService()) || typeof PaymentRequest === 'undefined') return 'failed';
  let response: PaymentResponse;
  try {
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY_METHOD, data: { sku: PLAY_PRODUCT_ID } }],
      // Google Play shows its own price; this total is required by the API but not displayed.
      { total: { label: 'Fluid Studio Pro', amount: { currency: 'USD', value: '0' } } },
    );
    response = await request.show();
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
  const token = (response.details as { purchaseToken?: string } | null)?.purchaseToken;
  const ok = token ? await redeem(token) : false;
  await response.complete(ok ? 'success' : 'fail').catch(() => undefined);
  return ok ? 'bought' : 'failed';
}
