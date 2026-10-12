/**
 * PaywallGate — wraps save and export actions behind a Pro check.
 *
 * Free tier: unlimited pouring, unlimited undo/redo, project file open/download.
 * Pro ($4.99/mo): Save to gallery, export PNG (1×/2×/4×), cloud sync.
 *
 * Gate logic is local — no network call needed to render.
 * Actual payment goes to Stripe. After payment, Stripe redirects to
 * /?upgraded=1 which stores a local session flag until the tab closes
 * (good enough for an MVP; replace with a real JWT/session check later).
 */

import React, { useEffect, useState } from 'react';
import { X, Sparkles, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Stripe buy link — replace with your actual Stripe payment link
// ---------------------------------------------------------------------------
const STRIPE_LINK =
  'https://buy.stripe.com/9B6aEY8QIdrP0iL4P21sQ0c';
const PRO_MONTHLY_PRICE = '$4.99 / month';
const SESSION_KEY = 'lbfs_pro_session';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the current tab session has Pro access. */
export function hasProAccess(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function grantProSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // sessionStorage blocked — ignore, gate stays open per refresh
  }
}

// ---------------------------------------------------------------------------
// Hook: reads URL param set by Stripe redirect and persists session
// ---------------------------------------------------------------------------
export function useProSession(): boolean {
  const [pro, setPro] = useState(hasProAccess);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      grantProSession();
      setPro(true);
      // Clean the URL so it doesn't linger
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
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
    // Return URL includes ?upgraded=1 so the session flag is set on redirect back
    const returnUrl = encodeURIComponent(
      `${window.location.href.split('?')[0]}?upgraded=1`,
    );
    window.location.href = `${STRIPE_LINK}?success_url=${returnUrl}`;
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
