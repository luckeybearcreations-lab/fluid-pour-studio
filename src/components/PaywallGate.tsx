/**
 * PaywallGate — wraps save and export actions behind a Pro check.
 *
 * Free tier: unlimited pouring, unlimited undo/redo, project file open/download.
 * Pro ($4.99/mo): Save to gallery, export PNG (1×/2×/4×), artwork inside project files.
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
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ open, feature, onClose }) => {
  if (!open) return null;

  const featureLabel =
    feature === 'save'
      ? 'save pours to your gallery'
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
          Pouring is free, always. Pro adds gallery saves and
          high-res PNG exports.
        </p>

        <ul className="paywall-perks">
          <li><Sparkles size={14} /> Save pours to your personal gallery</li>
          <li><Sparkles size={14} /> Keep the artwork inside your project files</li>
          <li><Sparkles size={14} /> 1×, 2×, and 4× print-ready PNG export</li>
          <li><Sparkles size={14} /> Cancel any time</li>
        </ul>

        <button className="paywall-cta" onClick={handleUpgrade}>
          Start Pro — {PRO_MONTHLY_PRICE}
        </button>

        <p className="paywall-fine">
          Secure checkout via Stripe. Pro stays with the browser you buy it in.{' '}
          <a href={MANAGE_SUBSCRIPTION_URL}>Manage or cancel</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
        </p>
      </div>
    </div>
  );
};
