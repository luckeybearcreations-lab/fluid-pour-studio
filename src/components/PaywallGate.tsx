/**
 * PaywallGate — wraps save and export actions behind a Pro check.
 *
 * Free tier: unlimited pouring, unlimited undo/redo, project file open/download.
 * Pro: Save to gallery, export PNG (1×/2×/4×), artwork inside project files.
 * On the web it is $4.99/mo through Stripe; in the Google Play app it is a one-time
 * purchase through Google Play (src/lib/playBilling.ts). The Play app never shows Stripe.
 *
 * Payment goes to Stripe. The payment link sends buyers back to
 * /?checkout={CHECKOUT_SESSION_ID}; the worker (worker/pro.ts) confirms the
 * purchase with Stripe and keeps Pro in a signed cookie, re-checking the
 * subscription once a day.
 */

import React from 'react';
import { MANAGE_SUBSCRIPTION_URL } from '@/lib/useProSession';
import { X, Sparkles, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Stripe buy link. Its "After payment" setting must redirect to
// https://<app domain>/?checkout={CHECKOUT_SESSION_ID}
// ---------------------------------------------------------------------------
const STRIPE_LINK =
  'https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c';
const PRO_MONTHLY_PRICE = '$4.99 / month';
// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------
interface PaywallModalProps {
  open: boolean;
  feature: 'save' | 'export';
  onClose: () => void;
  /** Set inside the Google Play app: Pro is sold by Google Play as a one-time unlock. */
  play?: { price: string | null; onBuy: () => Promise<void>; onRestore: () => Promise<void> };
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ open, feature, onClose, play }) => {
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;

  const featureLabel =
    feature === 'save'
      ? 'save pours to your gallery'
      : 'export your artwork as a print-ready PNG';

  const handleUpgrade = async () => {
    if (!play) {
      // The payment link itself redirects back here with the checkout id.
      window.location.href = STRIPE_LINK;
      return;
    }
    if (busy) return;
    setBusy(true);
    try { await play.onBuy(); onClose(); } finally { setBusy(false); }
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
          Pouring is free, always. Pro adds gallery saves and
          high-res PNG exports{play ? ', with one payment and no subscription' : ''}.
        </p>

        <ul className="paywall-perks">
          <li><Sparkles size={14} /> Save pours to your personal gallery</li>
          <li><Sparkles size={14} /> Keep the artwork inside your project files</li>
          <li><Sparkles size={14} /> 1×, 2×, and 4× print-ready PNG export</li>
          <li><Sparkles size={14} /> {play ? 'Pay once. Yours on every phone with your Google account' : 'Cancel any time'}</li>
        </ul>

        <button className="paywall-cta" onClick={handleUpgrade} disabled={busy}>
          {play ? `Unlock Pro — ${play.price ?? 'one-time purchase'}` : `Start Pro — ${PRO_MONTHLY_PRICE}`}
        </button>

        {play ? (
          <p className="paywall-fine">
            One-time purchase through Google Play.{' '}
            <button type="button" className="paywall-link" onClick={() => { void play.onRestore().then(onClose); }}>Restore purchase</button> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
          </p>
        ) : (
          <p className="paywall-fine">
            Secure checkout via Stripe. Pro stays with the browser you buy it in.{' '}
            <a href={MANAGE_SUBSCRIPTION_URL}>Manage or cancel</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
          </p>
        )}
      </div>
    </div>
  );
};
