/**
 * Pro subscriptions, checked on the server.
 *
 * After checkout, Stripe sends the buyer back to /?checkout={CHECKOUT_SESSION_ID}.
 * The app posts that id to /api/pro/claim; the worker asks Stripe whether the
 * checkout finished and bought Fluid Studio Pro, then stores a signed pass in
 * an HttpOnly cookie. /api/pro/status reads the pass and re-checks the
 * subscription with Stripe once a day, so a cancelled subscription loses Pro.
 *
 * In the Android app from Google Play, Pro is a one-time purchase instead. The
 * app posts Google Play's purchase token to /api/pro/play; the worker confirms
 * it with the Google Play Developer API, acknowledges it (Google refunds
 * purchases that are not acknowledged within three days), and stores the same
 * kind of signed pass. /api/pro/status re-checks it once a day, so a refunded
 * purchase loses Pro.
 *
 * Secrets (set with `wrangler secret put`):
 *   PRO_TOKEN_SECRET        any long random string; used to sign the pass
 *   STRIPE_SECRET_KEY       a restricted key with read access to Checkout Sessions and Subscriptions
 *   GOOGLE_SERVICE_ACCOUNT  the JSON key of a Google Cloud service account that has been
 *                           given access to the app in Play Console (financial data + manage orders)
 * Optional:
 *   PRO_PRODUCT_ID     the Stripe product that counts as Pro (defaults to Fluid Studio Pro)
 *   PLAY_PACKAGE_NAME  the Android package (defaults to com.luckybearcreations.fluidstudio)
 *   PLAY_PRODUCT_ID    the Play one-time product (defaults to pro_unlock)
 */

export interface ProEnv {
  STRIPE_SECRET_KEY?: string;
  PRO_TOKEN_SECRET?: string;
  PRO_PRODUCT_ID?: string;
  GOOGLE_SERVICE_ACCOUNT?: string;
  PLAY_PACKAGE_NAME?: string;
  PLAY_PRODUCT_ID?: string;
}

// A pass points at either a Stripe subscription (sub) or a Google Play purchase (play).
type Pass = { sub?: string; play?: string; chk: number };
type PlayPurchase = { purchaseState?: number; acknowledgementState?: number };
type Subscription = { id: string; status: string; items?: { data?: { price?: { product?: string } }[] } };
type CheckoutSession = { status: string; mode: string; subscription: Subscription | string | null };

const COOKIE = 'lbfs_pro';
const DEFAULT_PRODUCT = 'prod_VERfZwri6NJlS2';
const DEFAULT_PLAY_PACKAGE = 'com.luckybearcreations.fluidstudio';
const DEFAULT_PLAY_PRODUCT = 'pro_unlock';
const RECHECK_MS = 24 * 60 * 60 * 1000;
// Browsers cap cookie lifetimes at 400 days; the pass is refreshed on every re-check.
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
// past_due keeps Pro while Stripe retries a failed renewal.
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signPass(pass: Pass, secret: string) {
  const body = toB64url(enc.encode(JSON.stringify(pass)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${toB64url(sig)}`;
}

async function readPass(token: string, secret: string): Promise<Pass | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const pass = JSON.parse(dec.decode(fromB64url(body)));
    return (typeof pass?.sub === 'string' || typeof pass?.play === 'string') && typeof pass?.chk === 'number' ? pass : null;
  } catch {
    return null;
  }
}

function cookieOf(request: Request) {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

const setCookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/** GET from Stripe. Returns the object, 'missing' for a 404, or null when Stripe can't be reached. */
async function stripeGet<T>(env: ProEnv, path: string): Promise<T | 'missing' | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (res.status === 404) return 'missing';
    if (!res.ok) {
      console.error(`Stripe answered ${res.status} for ${path.split('?')[0]}`);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function isPro(sub: Subscription, env: ProEnv) {
  const product = env.PRO_PRODUCT_ID || DEFAULT_PRODUCT;
  return ACTIVE.has(sub.status) && (sub.items?.data ?? []).some(item => item.price?.product === product);
}

// ---------- Google Play ----------

let googleToken: { value: string; expires: number } | null = null;

/** An access token for the Google Play Developer API, from the service account key. */
async function googleAccessToken(env: ProEnv): Promise<string | null> {
  if (googleToken && googleToken.expires > Date.now() + 60_000) return googleToken.value;
  try {
    const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT ?? '') as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const header = toB64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claims = toB64url(enc.encode(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })));
    const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`)));
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${toB64url(sig)}` }),
    });
    if (!res.ok) {
      console.error(`Google sign-in answered ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    googleToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return googleToken.value;
  } catch {
    console.error('GOOGLE_SERVICE_ACCOUNT is missing or not a valid service account key');
    return null;
  }
}

const playPurchaseUrl = (env: ProEnv, token: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${env.PLAY_PACKAGE_NAME || DEFAULT_PLAY_PACKAGE}` +
  `/purchases/products/${env.PLAY_PRODUCT_ID || DEFAULT_PLAY_PRODUCT}/tokens/${encodeURIComponent(token)}`;

/** The purchase from Google Play, 'missing' when Google doesn't know the token, or null when Google can't be reached. */
async function playPurchase(env: ProEnv, token: string): Promise<PlayPurchase | 'missing' | null> {
  const access = await googleAccessToken(env);
  if (!access) return null;
  try {
    const res = await fetch(playPurchaseUrl(env, token), { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 400 || res.status === 404 || res.status === 410) return 'missing';
    if (!res.ok) {
      console.error(`Google Play answered ${res.status} for a purchase check`);
      return null;
    }
    return (await res.json()) as PlayPurchase;
  } catch {
    return null;
  }
}

async function playClaim(request: Request, env: ProEnv, secret: string) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[A-Za-z0-9._-]{20,1500}$/.test(token)) return json({ pro: false, error: 'Invalid purchase' }, 400);

  const purchase = await playPurchase(env, token);
  if (purchase === null) return json({ pro: false, error: 'Google Play unavailable' }, 502);
  // purchaseState 0 is a completed purchase (1 is cancelled or refunded, 2 is still pending).
  if (purchase === 'missing' || purchase.purchaseState !== 0) return json({ pro: false, error: 'Purchase not completed' }, 402);
  if (purchase.acknowledgementState !== 1) {
    const access = await googleAccessToken(env);
    const ack = access && await fetch(`${playPurchaseUrl(env, token)}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    // Unacknowledged purchases are refunded by Google, so don't unlock until this succeeds; the app retries on its next start.
    if (!ack || !ack.ok) return json({ pro: false, error: 'Could not confirm the purchase with Google Play' }, 502);
  }
  const pass = await signPass({ play: token, chk: Date.now() }, secret);
  return json({ pro: true }, 200, setCookie(pass, COOKIE_MAX_AGE));
}

// ---------- Stripe ----------

async function claim(request: Request, env: ProEnv, secret: string) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!env.STRIPE_SECRET_KEY) return json({ pro: false, error: 'Stripe is not set up on this server' }, 503);
  const body = (await request.json().catch(() => null)) as { session_id?: unknown } | null;
  const id = typeof body?.session_id === 'string' ? body.session_id : '';
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return json({ pro: false, error: 'Invalid checkout' }, 400);

  const session = await stripeGet<CheckoutSession>(env, `checkout/sessions/${id}?expand[]=subscription`);
  if (session === null) return json({ pro: false, error: 'Stripe unavailable' }, 502);
  if (session === 'missing') return json({ pro: false, error: 'Checkout not found' }, 400);
  const sub = session.subscription;
  if (session.status !== 'complete' || session.mode !== 'subscription' || !sub || typeof sub === 'string' || !isPro(sub, env)) {
    return json({ pro: false, error: 'Checkout did not buy Pro' }, 402);
  }
  const pass = await signPass({ sub: sub.id, chk: Date.now() }, secret);
  return json({ pro: true }, 200, setCookie(pass, COOKIE_MAX_AGE));
}

async function status(request: Request, env: ProEnv, secret: string) {
  const token = cookieOf(request);
  const pass = token ? await readPass(token, secret) : null;
  if (!pass) return json({ pro: false });
  if (Date.now() - pass.chk < RECHECK_MS) return json({ pro: true });

  if (pass.play) {
    if (!env.GOOGLE_SERVICE_ACCOUNT) return json({ pro: true });
    const purchase = await playPurchase(env, pass.play);
    // Google unreachable: keep Pro and try again on the next visit.
    if (purchase === null) return json({ pro: true });
    if (purchase === 'missing' || purchase.purchaseState !== 0) return json({ pro: false }, 200, setCookie('', 0));
    const renewed = await signPass({ play: pass.play, chk: Date.now() }, secret);
    return json({ pro: true }, 200, setCookie(renewed, COOKIE_MAX_AGE));
  }
  if (!pass.sub || !env.STRIPE_SECRET_KEY) return json({ pro: true });

  const sub = await stripeGet<Subscription>(env, `subscriptions/${pass.sub}`);
  // Stripe unreachable: keep Pro and try again on the next visit.
  if (sub === null) return json({ pro: true });
  if (sub === 'missing' || !isPro(sub, env)) return json({ pro: false }, 200, setCookie('', 0));
  const fresh = await signPass({ sub: pass.sub, chk: Date.now() }, secret);
  return json({ pro: true }, 200, setCookie(fresh, COOKIE_MAX_AGE));
}

export async function handleProRequest(request: Request, env: ProEnv): Promise<Response> {
  const secret = env.PRO_TOKEN_SECRET;
  if (!secret || (!env.STRIPE_SECRET_KEY && !env.GOOGLE_SERVICE_ACCOUNT)) return json({ pro: false, error: 'Pro is not set up on this server' }, 503);
  const { pathname } = new URL(request.url);
  if (pathname === '/api/pro/claim') return claim(request, env, secret);
  if (pathname === '/api/pro/play') {
    if (!env.GOOGLE_SERVICE_ACCOUNT) return json({ pro: false, error: 'Google Play purchases are not set up on this server' }, 503);
    return playClaim(request, env, secret);
  }
  if (pathname === '/api/pro/status') return status(request, env, secret);
  return json({ error: 'Not found' }, 404);
}
