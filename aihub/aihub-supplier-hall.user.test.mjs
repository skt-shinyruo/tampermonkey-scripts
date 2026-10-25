import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const buildScriptPath = fileURLToPath(new URL('./build-userscript.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('./aihub-supplier-hall.user.js', import.meta.url));

test('aihub source matches expected userscript metadata', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /\/\/ @name\s+AIHub/);
  assert.match(source, /\/\/ @match\s+https:\/\/aihub\.top\/\*/);
  assert.doesNotMatch(source, /@updateURL|@downloadURL/);
});

test('aihub build script injects build branch metadata into dist output', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'aihub-build-'));
  const outPath = join(outDir, 'aihub-supplier-hall.user.js');
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/aihub-supplier-hall.user.js';

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AIHUB_DOWNLOAD_URL: hostedScriptUrl,
      AIHUB_UPDATE_URL: hostedScriptUrl,
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(
    built,
    /\/\/ @updateURL    https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/aihub-supplier-hall\.user\.js/,
  );
  assert.match(
    built,
    /\/\/ @downloadURL  https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/aihub-supplier-hall\.user\.js/,
  );
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', outPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

test('aihub build script applies AIHUB_VERSION to @version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'aihub-build-version-'));
  const outPath = join(outDir, 'aihub-supplier-hall.user.js');

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AIHUB_VERSION: '2.0.123',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+2\.0\.123/);
});
