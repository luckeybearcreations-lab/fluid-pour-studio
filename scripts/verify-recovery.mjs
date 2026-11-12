import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const exists = async file => access(path.join(root, file)).then(() => true, () => false);

for (const forbidden of ['.openai/hosting.json', '.env', '.env.local']) {
  assert.equal(await exists(forbidden), false, `${forbidden} must remain absent`);
}

async function sourceFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (/\.(?:ts|tsx|js|jsx|mjs|json)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const scanRoots = ['app', 'src', 'worker', 'build', 'scripts'].map(folder => path.join(root, folder)).filter(existsSync);
const files = (await Promise.all(scanRoots.map(sourceFiles))).flat();
const banned = [
  ['Sites project identifier', /appgprj_[a-z0-9]+/i],
  ['Sites Git remote', /git\.chatgpt-team\.site/i],
  ['hard-coded cloud endpoint', /databasepad\.com/i],
  ['hard-coded JWT', /eyJhbGciOi/i],
  ['ShopLuckyBears production worker', /shopluckybears-launch-direct/i],
  ['commerce fulfillment wiring', /PRINTIFY_AUTO_FULFILL/i],
  ['hard-coded Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/],
];

for (const file of files) {
  if (file.endsWith('verify-recovery.mjs')) continue;
  const contents = await readFile(file, 'utf8');
  for (const [label, pattern] of banned) {
    assert.equal(pattern.test(contents), false, `${label} found in ${path.relative(root, file)}`);
  }
}

async function importBundle(entry) {
  const bundle = await build({ entryPoints: [path.join(root, entry)], bundle: true, format: 'esm', platform: 'browser', write: false });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(moduleUrl);
}

const { normalizeFluidProject, DEFAULT_PHYSICS } = await importBundle('src/lib/projectFile.ts');

const legacyFiles = [
  'C:/Users/Michael/Downloads/luckyapp6/Lucky Bear V6.2 Master.luckybear.json',
  'C:/Users/Michael/Downloads/luckyapp6/Loaded Lucky Bear Project.luckybear.json',
  'C:/Users/Michael/Downloads/luckyapp6/Loaded Lucky Bear Project.luckybear (1).json',
];

// These saved projects live on the owner's PC; the check is skipped anywhere else.
const fixtures = legacyFiles.filter(existsSync);
for (const fixture of fixtures) {
  const raw = JSON.parse(await readFile(fixture, 'utf8'));
  const project = normalizeFluidProject(raw);
  assert.equal(project.version, 'recovery-2');
  assert.equal(project.tool, 'pour');
  assert.equal(project.pourMode, 'dirty');
  assert.equal(project.spin, 0.2);
  assert.equal(project.cupColors.length, 5);
  assert.ok(project.canvasImage.startsWith('data:image/'));
}

const current = normalizeFluidProject({
  projectName: 'Compatibility test',
  color: { id: 'gold', name: 'Gold', hex: '#d4a537', metallic: true },
  cupColors: [{ id: 'gold', name: 'Gold', hex: '#d4a537', metallic: true }],
  tool: 'blower', pourMode: 'flip', surface: 'kraft', exportScale: 4,
  transparentExport: true, spin: -0.35, tilt: { x: 0.4, y: -0.2 },
});
assert.equal(current.tool, 'blower');
assert.equal(current.pourMode, 'flip');
assert.equal(current.surface, 'kraft');
assert.equal(current.exportScale, 4);
assert.equal(current.transparentExport, true);
assert.deepEqual(current.tilt, { x: 0.4, y: -0.2 });
assert.equal(current.color.material, 'metallic');
assert.equal(current.cupColors[0].amount, 20);
assert.equal(current.artistName, '', 'a project without an artist must not be given one');
for (const value of Object.values(current.params)) assert.ok(value >= 0 && value <= 1);

const legacyRc3 = normalizeFluidProject({
  projectName: 'RC3 compatibility', pourStyle: 'dirty', viscosity: 5, flowStrength: 7,
  cellDensity: 6, siliconeAmount: 35,
  recipe: [{ name: 'Layer', color: '#123456', amount: 44, silicone: 3 }],
});
assert.equal(legacyRc3.pourMode, 'dirty');
assert.equal(legacyRc3.params.viscosity, .5);
assert.equal(legacyRc3.params.flowRate, .7);
assert.equal(legacyRc3.params.silicone, .35);
assert.equal(legacyRc3.cupColors[0].silicone, .3);
assert.equal(legacyRc3.cupColors[0].amount, 44);

const { mixPigments, blendHex } = await importBundle('src/lib/palette.ts');
const mixedPigment = mixPigments('#ff0000', '#0000ff', .5);
assert.match(mixedPigment, /^#[0-9a-f]{6}$/i);
assert.notEqual(mixedPigment, blendHex('#ff0000', '#0000ff', .5));

const { createSim, spawnCupPour, ONE_SHOT_POUR_MODES } = await importBundle('src/lib/fluidEngine.ts');
for (const mode of ['flip', 'dirty', 'ring', 'dutch', 'swipe', 'open', 'bloom']) {
  assert.equal(ONE_SHOT_POUR_MODES.has(mode), true);
  const sim = createSim(900, 600, DEFAULT_PHYSICS);
  spawnCupPour(sim, 450, 300, [
    { id: 'red', name: 'Red', hex: '#d7263d', material: 'fluidAcrylic', amount: 30 },
    { id: 'pearl', name: 'Pearl', hex: '#e9dff2', material: 'pearl', amount: 15, silicone: .35 },
  ], mode);
  assert.ok(sim.particles.length >= 200, `${mode} should create a complete cup pour`);
  assert.ok(sim.particles.some(particle => particle.material === 'pearl'));
}


// ---------- Pro: Google Play purchases, checked against a fake Google ----------
{
  const { generateKeyPairSync, createVerify } = await import('node:crypto');
  const { handleProRequest } = await importBundle('worker/pro.ts');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = {
    PRO_TOKEN_SECRET: 'test-secret-test-secret-test-secret',
    GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'svc@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  };
  const good = 'good-purchase-token-0123456789';
  const refunded = 'refunded-purchase-token-0123456789';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { try { return await fake(url, init); } catch (err) { console.error("fake Google failed:", err.message); throw err; } };
  const fake = async (url, init) => {
    url = String(url); calls.push(`${init.method || 'GET'} ${url}`);
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(init.body).get('assertion');
      const [h, c, s] = assertion.split('.');
      assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')), 'the Google sign-in request must be signed by the service account');
      assert.equal(JSON.parse(Buffer.from(c, 'base64url')).scope, 'https://www.googleapis.com/auth/androidpublisher');
      return Response.json({ access_token: 'access', expires_in: 3600 });
    }
    assert.ok(url.includes('/applications/com.luckybear.fluidstudio/purchases/products/pro_unlock/tokens/'), url);
    assert.equal(init.headers.Authorization, 'Bearer access');
    if (url.endsWith(':acknowledge')) return new Response(null, { status: 204 });
    if (url.endsWith(good)) return Response.json({ purchaseState: 0, acknowledgementState: 0 });
    if (url.endsWith(refunded)) return Response.json({ purchaseState: 1, acknowledgementState: 1 });
    return new Response('{}', { status: 404 });
  };
  const post = token => handleProRequest(new Request('https://app.test/api/pro/play', { method: 'POST', body: JSON.stringify({ token }) }), env);
  try {
    const ok = await post(good);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).pro, true);
    const cookie = ok.headers.get('Set-Cookie');
    assert.match(cookie, /^lbfs_pro=[^;]+; .*HttpOnly; Secure/);
    assert.ok(calls.some(c => c.startsWith('POST') && c.endsWith(':acknowledge')), 'a new purchase must be acknowledged');
    const status = await handleProRequest(new Request('https://app.test/api/pro/status', { headers: { Cookie: cookie.split(';')[0] } }), env);
    assert.equal((await status.json()).pro, true);
    assert.equal((await (await post(refunded)).json()).pro, false, 'a refunded purchase must not unlock Pro');
    assert.equal((await post('unknown-purchase-token-0123456789')).status, 402);
    assert.equal((await post('bad token!')).status, 400);
    const forged = await handleProRequest(new Request('https://app.test/api/pro/status', { headers: { Cookie: 'lbfs_pro=eyJwbGF5IjoieCIsImNoayI6MX0.AAAA' } }), env);
    assert.equal((await forged.json()).pro, false, 'an unsigned pass must not unlock Pro');
    const noGoogle = await handleProRequest(new Request('https://app.test/api/pro/play', { method: 'POST', body: '{}' }), { PRO_TOKEN_SECRET: 'x', STRIPE_SECRET_KEY: 'unused' });
    assert.equal(noGoogle.status, 503);
  } finally { globalThis.fetch = realFetch; }
  console.log('Google Play purchase check, acknowledgement, refund and forged-pass cases verified.');
}

console.log(`Recovery isolation verified across ${files.length} source/config files.`);
console.log(fixtures.length ? `Legacy project compatibility verified with ${fixtures.length} saved projects.` : 'Legacy saved-project fixtures not found on this machine: skipped.');
console.log('Material, pigment-mixing, and seven complete cup-pour modes verified.');
