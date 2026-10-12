import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
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

const scanRoots = ['app', 'src', 'worker', 'build', 'scripts'].map(folder => path.join(root, folder));
const files = (await Promise.all(scanRoots.map(sourceFiles))).flat();
const banned = [
  ['Sites project identifier', /appgprj_[a-z0-9]+/i],
  ['Sites Git remote', /git\.chatgpt-team\.site/i],
  ['hard-coded cloud endpoint', /databasepad\.com/i],
  ['hard-coded JWT', /eyJhbGciOi/i],
  ['ShopLuckyBears production worker', /shopluckybears-launch-direct/i],
  ['commerce fulfillment wiring', /PRINTIFY_AUTO_FULFILL|STRIPE_SECRET/i],
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

for (const fixture of legacyFiles) {
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

console.log(`Recovery isolation verified across ${files.length} source/config files.`);
console.log(`Legacy project compatibility verified with ${legacyFiles.length} saved projects.`);
console.log('Material, pigment-mixing, and seven complete cup-pour modes verified.');
