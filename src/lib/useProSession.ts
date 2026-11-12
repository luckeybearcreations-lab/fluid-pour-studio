import { useCallback, useEffect, useRef, useState } from 'react';
import { buyPlayUnlock, playPrice, playService, restorePlayPurchase } from '@/lib/playBilling';

export const SUPPORT_EMAIL = 'luckeybearcreations@gmail.com';

/**
 * The one address the website lives at. Stripe sends buyers back here after
 * checkout and Pro is remembered per address, so every other address that
 * serves the app (an old domain, the workers.dev address) points people here.
 * If the app moves, change this and the payment link's redirect together.
 */
export const HOME_HOST = 'fluidpour.shopluckybears.com';

/** The same page at the home address, or null when this already is the home address (or a local or app build). */
export function homeAddress(): string | null {
  if (typeof window === 'undefined') return null;
  const { hostname, pathname, search } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost') || hostname.endsWith('.test');
  if (hostname === HOME_HOST || local) return null;
  return `https://${HOME_HOST}${pathname}${search}`;
}

// Stripe customer portal login link (Stripe → Settings → Billing → Customer portal → "Launch customer portal").
// Subscribers enter their email there and get a link to cancel or update their card.
// If this is ever emptied, the app offers cancelling by email instead.
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/5kQfZi6IAdrPfdFchu1sQ00';
export const MANAGE_SUBSCRIPTION_URL = STRIPE_PORTAL_URL
  || `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cancel my Fluid Studio Pro subscription')}`;

export interface ProSession {
  pro: boolean;
  /** True inside the Android app from Google Play, where Pro is sold by Google Play instead of Stripe. */
  playApp: boolean;
  /** Google Play's price for the one-time unlock, once known. */
  playPrice: string | null;
  buyWithPlay: () => Promise<void>;
  restoreWithPlay: () => Promise<void>;
}

/**
 * Asks the server whether this browser has Pro, and claims Pro when Stripe
 * sends the buyer back after checkout (/?checkout={CHECKOUT_SESSION_ID}).
 * In the Google Play app it also restores and sells the one-time unlock.
 */
export function useProSession(onNotice?: (message: string) => void): ProSession {
  const [pro, setPro] = useState(false);
  const [playApp, setPlayApp] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout) {
      // Clean the URL so a refresh doesn't claim again
      params.delete('checkout');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
    const request = checkout
      ? fetch('/api/pro/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: checkout }),
        })
      : fetch('/api/pro/status', { cache: 'no-store' });
    request
      .then(res => res.json().catch(() => ({})))
      .then((data: { pro?: boolean }) => {
        if (data.pro) {
          setPro(true);
          if (checkout) noticeRef.current?.('Pro unlocked. Thanks for subscribing!');
        } else if (checkout) {
          noticeRef.current?.(`We couldn't confirm your payment yet. Refresh in a minute, or email ${SUPPORT_EMAIL}.`);
        }
      })
      .catch(() => {
        if (checkout) noticeRef.current?.(`We couldn't reach the server to confirm your payment. Refresh to try again.`);
      });
  }, []);

  // Google Play app: show Play's price, and bring Pro back if this Google account already owns it.
  useEffect(() => {
    let cancelled = false;
    playService().then(async play => {
      if (!play || cancelled) return;
      setPlayApp(true);
      playPrice().then(p => { if (!cancelled) setPrice(p); });
      if (await restorePlayPurchase() && !cancelled) setPro(true);
    });
    return () => { cancelled = true; };
  }, []);

  const buyWithPlay = useCallback(async () => {
    const result = await buyPlayUnlock();
    if (result === 'bought') { setPro(true); noticeRef.current?.('Pro unlocked. Thank you!'); }
    else if (result === 'failed') noticeRef.current?.(`We couldn't finish the purchase. If you were charged, tap Restore purchase, or email ${SUPPORT_EMAIL}.`);
  }, []);

  const restoreWithPlay = useCallback(async () => {
    if (await restorePlayPurchase()) { setPro(true); noticeRef.current?.('Pro restored.'); }
    else noticeRef.current?.('No Pro purchase was found on this Google account.');
  }, []);

  return { pro, playApp, playPrice: price, buyWithPlay, restoreWithPlay };
}
