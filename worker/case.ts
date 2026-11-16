/**
 * "Put this pour on a phone case" orders (website only, filled by hand).
 *
 * The app posts the pour as a JPEG to /api/case/upload. The worker stores it in
 * the CASE_ART R2 bucket under a random id and answers with a Stripe payment
 * link that carries the id as client_reference_id. After the buyer pays, the
 * payment in Stripe shows that id; the artwork is then at /api/case/art/<id>.
 * The order itself is placed by hand in Printify.
 *
 * Needs:
 *   CASE_ART            R2 bucket binding (vite.config.ts)
 *   CASE_CHECKOUT_URL   the Stripe payment link for the phone case, either as a
 *                       worker secret or as DEFAULT_CHECKOUT below
 * Until both exist, /api/case/config answers enabled:false and the app hides the button.
 */

interface R2Object { body: ReadableStream; size: number }
interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
}
export interface CaseEnv { CASE_ART?: R2Bucket; CASE_CHECKOUT_URL?: string }

/** The Stripe payment link for the phone case. Empty until the product and price exist. */
const DEFAULT_CHECKOUT = '';
const MAX_BYTES = 6 * 1024 * 1024;
const ID = /^[0-9a-f]{32}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The payment link, only if it is a real Stripe address. */
export function checkoutUrl(env: CaseEnv): string | null {
  const url = (env.CASE_CHECKOUT_URL || DEFAULT_CHECKOUT).trim();
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(url) ? url : null;
}

async function upload(request: Request, bucket: R2Bucket, checkout: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // Only this site's own pages may post artwork.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Not allowed' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'That pour is too large to send.' }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'That pour is too large to send.' }, 413);
  const head = new Uint8Array(bytes.slice(0, 3));
  if (bytes.byteLength < 1024 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: 'That is not a picture of a pour.' }, 400);
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  await bucket.put(`${id}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return json({ id, checkout: `${checkout}?client_reference_id=${id}` });
}

async function art(bucket: R2Bucket, name: string): Promise<Response> {
  const id = name.replace(/\.jpg$/, '');
  if (!ID.test(id)) return json({ error: 'Not found' }, 404);
  const object = await bucket.get(`${id}.jpg`);
  if (!object) return json({ error: 'Not found' }, 404);
  return new Response(object.body, { headers: {
    'content-type': 'image/jpeg', 'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="phone-case-${id.slice(0, 8)}.jpg"`,
    'x-robots-tag': 'noindex',
  } });
}

export async function handleCaseRequest(request: Request, env: CaseEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const checkout = checkoutUrl(env);
  const bucket = env.CASE_ART;
  if (pathname === '/api/case/config') return json({ enabled: Boolean(bucket && checkout) });
  if (!bucket || !checkout) return json({ error: 'Phone case orders are not set up on this server' }, 503);
  if (pathname === '/api/case/upload') return upload(request, bucket, checkout);
  if (pathname.startsWith('/api/case/art/')) return art(bucket, pathname.slice('/api/case/art/'.length));
  return json({ error: 'Not found' }, 404);
}
