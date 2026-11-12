import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Use | Lucky Bear Fluid Studio" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <a href="/">← Back to the studio</a>
        <h1>Terms of Use</h1>
        <p className="legal-meta">Lucky Bear Fluid Studio · Luckey Bear Creations LLC, Minot, North Dakota · Last updated November 12, 2026</p>

        <h2>Using the app</h2>
        <p>Fluid Studio is a digital paint-pouring studio. Pouring, tilting, spinning, undo and redo are free. By using the app you agree to these terms.</p>

        <h2>Your artwork</h2>
        <p>The artwork you make is yours. You may use, print, share and sell it. We claim no rights in it.</p>

        <h2>Fluid Studio Pro</h2>
        <ul>
          <li>Pro is a subscription billed at $4.99 per month through Stripe until you cancel.</li>
          <li>Pro adds saving pours to your gallery, PNG export at 1×, 2× and 4×, and keeping the artwork inside project files.</li>
          <li>Pro is tied to the browser or device you subscribe in. It does not currently carry over to other devices.</li>
          <li>You can cancel at any time from the <a href="https://billing.stripe.com/p/login/5kQfZi6IAdrPfdFchu1sQ00">subscription page</a> (enter the email you subscribed with), or by emailing <a href="mailto:luckeybearcreations@gmail.com">luckeybearcreations@gmail.com</a>. Pro stays active until the end of the period you have paid for.</li>
          <li>If something went wrong with a charge, email us and we will sort it out.</li>
        </ul>

        <h2>Saved work</h2>
        <p>Saved pours, recipes and settings are stored on your device. Clearing your browser or app data deletes them, and we cannot recover them. Download a project file or export an image to keep a copy.</p>

        <h2>The app is provided as is</h2>
        <p>We work to keep Fluid Studio running well, but it is provided without warranties, and we are not liable for lost artwork or other losses from using it, to the extent the law allows.</p>

        <h2>Changes</h2>
        <p>We may update the app and these terms. The current terms are always on this page.</p>

        <h2>Contact</h2>
        <p>Luckey Bear Creations LLC · <a href="mailto:luckeybearcreations@gmail.com">luckeybearcreations@gmail.com</a></p>
      </article>
    </main>
  );
}
