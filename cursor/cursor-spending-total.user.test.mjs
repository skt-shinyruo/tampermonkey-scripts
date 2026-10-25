import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const buildScriptPath = fileURLToPath(new URL('./build-userscript.mjs', import.meta.url));
const sourcePath = fileURLToPath(new URL('./cursor-spending-total.user.js', import.meta.url));

test('cursor source matches expected userscript metadata', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /\/\/ @name\s+Cursor Spending 显示用量总额/);
  assert.match(source, /\/\/ @match\s+https:\/\/cursor\.com\/dashboard\/spending\*/);
  assert.doesNotMatch(source, /@updateURL|@downloadURL/);
});

test('cursor build script injects build branch metadata into dist output', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'cursor-build-'));
  const outPath = join(outDir, 'cursor-spending-total.user.js');
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/cursor-spending-total.user.js';

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CURSOR_DOWNLOAD_URL: hostedScriptUrl,
      CURSOR_UPDATE_URL: hostedScriptUrl,
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(
    built,
    /\/\/ @updateURL    https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/cursor-spending-total\.user\.js/,
  );
  assert.match(
    built,
    /\/\/ @downloadURL  https:\/\/raw\.githubusercontent\.com\/skt-shinyruo\/tampermonkey-scripts\/build\/cursor-spending-total\.user\.js/,
  );
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', outPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

test('cursor build script applies CURSOR_VERSION to @version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'cursor-build-version-'));
  const outPath = join(outDir, 'cursor-spending-total.user.js');

  execFileSync(process.execPath, [buildScriptPath, `--output=${outPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CURSOR_VERSION: '3.0.123',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+3\.0\.123/);
});
