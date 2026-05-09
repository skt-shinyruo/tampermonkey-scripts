import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const buildScriptPath = fileURLToPath(new URL('./build-userscript.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('./linuxdo-open-links-new-tab.user.js', import.meta.url));

test('linuxdo build script injects build branch metadata into dist output', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'linuxdo-build-'));
  const outPath = join(outDir, 'linuxdo-open-links-new-tab.user.js');
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/linuxdo-open-links-new-tab.user.js';

  const source = readFileSync(sourcePath, 'utf8');
  assert.doesNotMatch(source, /@updateURL|@downloadURL/);

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LINUXDO_DOWNLOAD_URL: hostedScriptUrl,
      LINUXDO_UPDATE_URL: hostedScriptUrl,
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(
    built,
    /\/\/ @updateURL    https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/linuxdo-open-links-new-tab\.user\.js/,
  );
  assert.match(
    built,
    /\/\/ @downloadURL  https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/linuxdo-open-links-new-tab\.user\.js/,
  );
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', outPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

test('linuxdo build script applies LINUXDO_VERSION to @version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'linuxdo-build-version-'));
  const outPath = join(outDir, 'linuxdo-open-links-new-tab.user.js');

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LINUXDO_VERSION: '0.1.123',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+0\.1\.123/);
});
