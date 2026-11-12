import { useEffect, useRef, useState } from 'react';

export const SUPPORT_EMAIL = 'luckeybearcreations@gmail.com';

// Stripe customer portal login link (Stripe → Settings → Billing → Customer portal → "Launch customer portal").
// Leave empty until it is switched on; the app then offers cancelling by email instead.
const STRIPE_PORTAL_URL = '';
export const MANAGE_SUBSCRIPTION_URL = STRIPE_PORTAL_URL
  || `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cancel my Fluid Studio Pro subscription')}`;

/**
 * Asks the server whether this browser has Pro, and claims Pro when Stripe
 * sends the buyer back after checkout (/?checkout={CHECKOUT_SESSION_ID}).
 */
export function useProSession(onNotice?: (message: string) => void): boolean {
  const [pro, setPro] = useState(false);
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

  return pro;
}
