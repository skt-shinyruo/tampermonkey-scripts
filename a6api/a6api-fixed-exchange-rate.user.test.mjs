import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const buildScriptPath = fileURLToPath(new URL('./build-userscript.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('./a6api-fixed-exchange-rate.user.js', import.meta.url));

function loadInternals() {
  const context = {
    __A6API_FIXED_RATE_TESTING__: true,
    document: {},
    window: {
      location: {
        hostname: 'test.invalid',
        pathname: '/',
      },
    },
  };
  vm.runInNewContext(readFileSync(sourcePath, 'utf8'), context);
  return context.__A6API_FIXED_RATE_INTERNALS__;
}

test('calculates the requested 6.95 multiplier from merchant and official input prices', () => {
  const api = loadInternals();

  const merchantPrice = api.parsePrice('$0.0564');
  const officialPrice = api.parsePrice('$5.000');
  const multiplier = api.calculateFixedMultiplier(merchantPrice, officialPrice);

  assert.ok(Math.abs(multiplier - 0.078396) < Number.EPSILON);
  assert.equal(api.formatMultiplier(multiplier), '0.0784');
});

test('parses formatted prices and rejects missing or invalid official prices', () => {
  const api = loadInternals();

  assert.equal(api.parsePrice('¥1,234.50'), 1234.5);
  assert.equal(api.parsePrice('--'), null);
  assert.equal(api.calculateFixedMultiplier(1, 0), null);
  assert.equal(api.calculateFixedMultiplier(null, 5), null);
});

test('supports the equivalent collapsed mobile-card calculation', () => {
  const api = loadInternals();
  const multiplier = api.calculateFromDisplayedMultiplier(0.0761, 6.75);

  assert.equal(api.formatMultiplier(multiplier), '0.0784');
});

test('matches the root document and activates only on model-market SPA paths', () => {
  const source = readFileSync(sourcePath, 'utf8');
  const api = loadInternals();

  assert.match(source, /\/\/ @match\s+https:\/\/a6api\.com\/\*/);
  assert.equal(api.isModelsPath('/'), false);
  assert.equal(api.isModelsPath('/models'), true);
  assert.equal(api.isModelsPath('/models/'), true);
  assert.equal(api.isModelsPath('/models-legacy'), false);
});

test('build script injects publish metadata and version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'a6api-build-'));
  const outPath = join(outDir, 'a6api-fixed-exchange-rate.user.js');
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-fixed-exchange-rate.user.js';

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      A6API_DOWNLOAD_URL: hostedScriptUrl,
      A6API_UPDATE_URL: hostedScriptUrl,
      A6API_VERSION: '0.2.123',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+0\.2\.123/);
  assert.match(built, /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/a6api-fixed-exchange-rate\.user\.js/);
  assert.match(built, /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/a6api-fixed-exchange-rate\.user\.js/);
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', outPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});
