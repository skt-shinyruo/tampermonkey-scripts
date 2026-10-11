import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const buildScriptPath = fileURLToPath(new URL('./build-userscript.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('./a6api-channel-market-search.user.js', import.meta.url));

test('a6api source matches expected userscript metadata', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /\/\/ @name\s+A6API 渠道名称 → 市场自动搜索/);
  assert.match(source, /\/\/ @match\s+https:\/\/a6api\.com\/\*/);
  assert.match(source, /\/\/ @grant\s+GM_openInTab/);
  assert.match(source, /\/\/ @grant\s+GM\.openInTab/);
  assert.doesNotMatch(source, /@updateURL|@downloadURL/);
});

test('a6api build script injects build branch metadata into dist output', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'a6api-build-'));
  const outPath = join(outDir, 'a6api-channel-market-search.user.js');
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js';

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      A6API_DOWNLOAD_URL: hostedScriptUrl,
      A6API_UPDATE_URL: hostedScriptUrl,
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(
    built,
    /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/a6api-channel-market-search\.user\.js/,
  );
  assert.match(
    built,
    /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/a6api-channel-market-search\.user\.js/,
  );
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', outPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

test('a6api build script applies A6API_VERSION to @version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'a6api-build-version-'));
  const outPath = join(outDir, 'a6api-channel-market-search.user.js');

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      A6API_VERSION: '1.3.99',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+1\.3\.99/);
});
