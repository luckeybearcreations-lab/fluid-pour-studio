/**
 * Pro subscriptions, checked on the server.
 *
 * After checkout, Stripe sends the buyer back to /?checkout={CHECKOUT_SESSION_ID}.
 * The app posts that id to /api/pro/claim; the worker asks Stripe whether the
 * checkout finished and bought Fluid Studio Pro, then stores a signed pass in
 * an HttpOnly cookie. /api/pro/status reads the pass and re-checks the
 * subscription with Stripe once a day, so a cancelled subscription loses Pro.
 *
 * Secrets (set with `wrangler secret put`):
 *   STRIPE_SECRET_KEY  a restricted key with read access to Checkout Sessions and Subscriptions
 *   PRO_TOKEN_SECRET   any long random string; used to sign the pass
 * Optional:
 *   PRO_PRODUCT_ID     the Stripe product that counts as Pro (defaults to Fluid Studio Pro)
 */

export interface ProEnv {
  STRIPE_SECRET_KEY?: string;
  PRO_TOKEN_SECRET?: string;
  PRO_PRODUCT_ID?: string;
}

type Pass = { sub: string; chk: number };
type Subscription = { id: string; status: string; items?: { data?: { price?: { product?: string } }[] } };
type CheckoutSession = { status: string; mode: string; subscription: Subscription | string | null };

const COOKIE = 'lbfs_pro';
const DEFAULT_PRODUCT = 'prod_VERfZwri6NJlS2';
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
    return typeof pass?.sub === 'string' && typeof pass?.chk === 'number' ? pass : null;
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

async function claim(request: Request, env: ProEnv, secret: string) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
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

  const sub = await stripeGet<Subscription>(env, `subscriptions/${pass.sub}`);
  // Stripe unreachable: keep Pro and try again on the next visit.
  if (sub === null) return json({ pro: true });
  if (sub === 'missing' || !isPro(sub, env)) return json({ pro: false }, 200, setCookie('', 0));
  const fresh = await signPass({ sub: pass.sub, chk: Date.now() }, secret);
  return json({ pro: true }, 200, setCookie(fresh, COOKIE_MAX_AGE));
}

export async function handleProRequest(request: Request, env: ProEnv): Promise<Response> {
  const secret = env.PRO_TOKEN_SECRET;
  if (!env.STRIPE_SECRET_KEY || !secret) return json({ pro: false, error: 'Pro is not set up on this server' }, 503);
  const { pathname } = new URL(request.url);
  if (pathname === '/api/pro/claim') return claim(request, env, secret);
  if (pathname === '/api/pro/status') return status(request, env, secret);
  return json({ error: 'Not found' }, 404);
}
