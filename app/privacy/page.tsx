import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy | Lucky Bear Fluid Studio" };

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <a href="/">← Back to the studio</a>
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Lucky Bear Fluid Studio · Luckey Bear Creations LLC, Minot, North Dakota · Last updated November 12, 2026</p>

        <h2>The short version</h2>
        <p>Fluid Studio has no accounts, no ads and no tracking or analytics. Your artwork stays on your device unless you choose to download or share it.</p>

        <h2>What stays on your device</h2>
        <ul>
          <li>Saved pours in your gallery, your recipes, and your studio settings are stored in your browser's storage on your device. We cannot see them.</li>
          <li>Project files and exported images are downloaded to your device. They are not sent to us.</li>
          <li>Clearing your browser or app data removes them.</li>
        </ul>

        <h2>Payments</h2>
        <p>Fluid Studio Pro is sold through Stripe. Stripe collects your payment details and email address to process the subscription; we never see your card number. We can see your subscription status, your email address and your payment history in our Stripe account. See <a href="https://stripe.com/privacy" rel="noopener noreferrer">Stripe's privacy policy</a>.</p>
        <p>After you subscribe, the app stores one cookie, <code>lbfs_pro</code>, that holds a signed reference to your subscription so the app knows Pro is active. It is not used for advertising or tracking.</p>

        <h2>Hosting</h2>
        <p>The app is served through Cloudflare. Like any web host, Cloudflare processes technical information such as your IP address and browser type to deliver the app and protect it from abuse.</p>

        <h2>Children</h2>
        <p>Fluid Studio is a general-audience art app. We do not knowingly collect personal information from children. Purchases must be made by an adult.</p>

        <h2>Your choices</h2>
        <ul>
          <li>To delete your saved pours and settings, clear the app's data in your browser or device settings.</li>
          <li>To cancel Pro, or to ask what we hold about your subscription or have it deleted, email us.</li>
        </ul>

        <h2>Changes</h2>
        <p>If this policy changes, the new version will be posted on this page with a new date.</p>

        <h2>Contact</h2>
        <p>Luckey Bear Creations LLC · <a href="mailto:luckeybearcreations@gmail.com">luckeybearcreations@gmail.com</a></p>
      </article>
    </main>
  );
}
