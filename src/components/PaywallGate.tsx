/**
 * PaywallGate — wraps save and export actions behind a Pro check.
 *
 * Free tier: unlimited pouring, unlimited undo/redo, project file open/download.
 * Pro ($4.99/mo): Save to gallery, export PNG (1×/2×/4×), cloud sync.
 *
 * Payment goes to Stripe. The payment link sends buyers back to
 * /?checkout={CHECKOUT_SESSION_ID}; the worker (worker/pro.ts) confirms the
 * purchase with Stripe and keeps Pro in a signed cookie, re-checking the
 * subscription once a day. Founder links (/?founder=<code>) unlock Pro for the owners.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Stripe buy link. Its "After payment" setting must redirect to
// https://<app domain>/?checkout={CHECKOUT_SESSION_ID}
// ---------------------------------------------------------------------------
const STRIPE_LINK =
  'https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c';
const PRO_MONTHLY_PRICE = '$4.99 / month';
const SUPPORT_EMAIL = 'luckeybearcreations@gmail.com';

// ---------------------------------------------------------------------------
// Hook: asks the server whether this browser has Pro, and claims Pro when
// Stripe sends the buyer back after checkout.
// ---------------------------------------------------------------------------
export function useProSession(onNotice?: (message: string) => void): boolean {
  const [pro, setPro] = useState(false);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const founder = params.get('founder');
    if (checkout || founder) {
      // Clean the URL so a refresh doesn't claim again
      params.delete('checkout');
      params.delete('founder');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
    const post = (path: string, body: unknown) =>
      fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const request = checkout
      ? post('/api/pro/claim', { session_id: checkout })
      : founder
        ? post('/api/pro/founder', { code: founder })
        : fetch('/api/pro/status', { cache: 'no-store' });
    request
      .then(res => res.json().catch(() => ({})))
      .then((data: { pro?: boolean }) => {
        if (data.pro) {
          setPro(true);
          if (checkout) noticeRef.current?.('Pro unlocked. Thanks for subscribing!');
          if (founder) noticeRef.current?.('Founder access unlocked on this device.');
        } else if (checkout) {
          noticeRef.current?.(`We couldn't confirm your payment yet. Refresh in a minute, or email ${SUPPORT_EMAIL}.`);
        } else if (founder) {
          noticeRef.current?.(`That founder link didn't work. Email ${SUPPORT_EMAIL}.`);
        }
      })
      .catch(() => {
        if (checkout) noticeRef.current?.(`We couldn't reach the server to confirm your payment. Refresh to try again.`);
        if (founder) noticeRef.current?.(`We couldn't reach the server. Open the founder link again to retry.`);
      });
  }, []);

  return pro;
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------
interface PaywallModalProps {
  open: boolean;
  feature: 'save' | 'export';
  onClose: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ open, feature, onClose }) => {
  if (!open) return null;

  const featureLabel =
    feature === 'save'
      ? 'save pours to your gallery and sync across devices'
      : 'export your artwork as a print-ready PNG';

  const handleUpgrade = () => {
    // The payment link itself redirects back here with the checkout id.
    window.location.href = STRIPE_LINK;
  };

  return (
    <div className="paywall-overlay" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
      <div className="paywall-card">
        <button className="paywall-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="paywall-icon">
          <Lock size={28} />
        </div>

        <h2 className="paywall-title">Go Pro to {featureLabel}</h2>

        <p className="paywall-desc">
          Pour freely — forever free. Unlock gallery saves, cloud sync,
          and high-res PNG exports with a Pro subscription.
        </p>

        <ul className="paywall-perks">
          <li><Sparkles size={14} /> Save pours to your personal gallery</li>
          <li><Sparkles size={14} /> Cloud sync across devices</li>
          <li><Sparkles size={14} /> 1×, 2×, and 4× print-ready PNG export</li>
          <li><Sparkles size={14} /> Cancel any time — no commitment</li>
        </ul>

        <button className="paywall-cta" onClick={handleUpgrade}>
          Start Pro — {PRO_MONTHLY_PRICE}
        </button>

        <p className="paywall-fine">
          Secure checkout via Stripe. Cancel any time from your account.
        </p>
      </div>
    </div>
  );
};
