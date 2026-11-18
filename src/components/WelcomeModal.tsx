/**
 * WelcomeModal: a short hello, how to pour, and a friendly ask for a review.
 *
 * Shown once on first launch (AppLayout, WELCOME_SCREEN_KEY) and again from
 * More → Welcome & tips. The review button opens the app's Google Play page:
 * inside the Play app through the Play Store itself, in an Android browser
 * through the Play web page. Elsewhere (iPhone, desktop) there is no Play page
 * to review on, so the review ask is left out.
 */

import React from 'react';
import { X, Palette, Droplets, Move, Save, Star } from 'lucide-react';

const PLAY_PACKAGE = 'com.luckybearcreations.fluidstudio';
const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
// Opens the Play Store app directly; Chrome hands market:// links to Android.
const PLAY_STORE_URL = `market://details?id=${PLAY_PACKAGE}`;

/** True when a Google Play review is possible from this device. */
function canReviewOnPlay(playApp: boolean): boolean {
  if (playApp) return true;
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/** Opens the app's Google Play page so the visitor can leave a review. */
function openPlayReview(playApp: boolean) {
  const insideApp = playApp || (typeof document !== 'undefined' && document.referrer.startsWith('android-app://'));
  if (insideApp) window.location.href = PLAY_STORE_URL;
  else window.open(PLAY_WEB_URL, '_blank', 'noopener');
}

interface WelcomeModalProps {
  open: boolean;
  /** True inside the Android app from Google Play. */
  playApp: boolean;
  onClose: () => void;
}

const STEPS: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Palette size={16} />, title: 'Fill your cup', text: 'Tap Mix and pick up to five colors.' },
  { icon: <Droplets size={16} />, title: 'Pour', text: 'Hold and drag on the canvas. Try Flip Cup, Swipe, Tree Ring and more.' },
  { icon: <Move size={16} />, title: 'Tilt and spin', text: 'Use Tilt or the turntable to stretch the paint and open up cells.' },
  { icon: <Save size={16} />, title: 'Keep it', text: 'Save your pour, or tap Clip to record a short video to share.' },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ open, playApp, onClose }) => {
  if (!open) return null;
  const review = canReviewOnPlay(playApp);

  return (
    <div className="paywall-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="paywall-card welcome-card">
        <button className="paywall-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <img className="welcome-mark" src="/lucky-bear-mark.webp" alt="" aria-hidden="true" width={56} height={56} />

        <h2 id="welcome-title" className="paywall-title">Welcome to Fluid Pour Studio</h2>

        <p className="paywall-desc">
          Thanks for giving it a try! Pour, tilt and spin real-feeling acrylic paint right on
          your phone, with no mess and no wasted paint. Pouring is always free.
        </p>

        <ol className="welcome-steps">
          {STEPS.map(step => (
            <li key={step.title}>
              <span className="welcome-step-icon">{step.icon}</span>
              <span><b>{step.title}.</b> {step.text}</span>
            </li>
          ))}
        </ol>

        {review && (
          <div className="welcome-review">
            <p>
              I'm a small business and this app is brand new, so your feedback means a lot. If you're
              enjoying it, please leave a quick review on Google Play and tell me what you'd like to
              see next. I read every one and use them to make the app better. Thank you!
            </p>
            <button type="button" className="welcome-review-button" onClick={() => openPlayReview(playApp)}>
              <Star size={16} /> Leave a review
            </button>
          </div>
        )}

        <button className="paywall-cta" onClick={onClose}>Start pouring</button>

        <p className="welcome-sign">Lucky Bear Creations</p>
      </div>
    </div>
  );
};
