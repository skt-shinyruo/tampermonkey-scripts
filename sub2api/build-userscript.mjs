import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultOutputPath = resolve(scriptDir, '..', 'dist', 'sub2api-helper.user.js');
const partPaths = [
  'src/parts/00-constants-storage.js',
  'src/parts/01-date-utils.js',
  'src/parts/02-dom-sidebar-selectors.js',
  'src/parts/03-settings-ui.js',
  'src/parts/04-range-granularity-rewrite.js',
  'src/parts/05-auto-refresh.js',
  'src/parts/06-enhancements-watchers.js',
].map((path) => resolve(scriptDir, path));

function getArgValue(name) {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const outputPath = resolve(process.cwd(), getArgValue('--output') || defaultOutputPath);
const updateUrl = process.env.SUB2API_UPDATE_URL || '';
const downloadUrl = process.env.SUB2API_DOWNLOAD_URL || updateUrl;
const baseVersion = '0.22';
const scriptVersion = process.env.SUB2API_VERSION || `${baseVersion}.0`;
const publishMetadataLines = [
  updateUrl ? `// @updateURL    ${updateUrl}` : '',
  downloadUrl ? `// @downloadURL  ${downloadUrl}` : '',
].filter(Boolean);

const header = `// ==UserScript==
// @name         Sub2API Helper
// @namespace    https://github.com/skt-shinyruo/tampermonkey-scripts
// @version      ${scriptVersion}
// @description  为 Sub2API 管理端提供深色、浅色、系统主题模式和侧边栏收起状态记忆；为使用记录页增加日期范围、粒度、每页记忆与自动刷新倒计时，并为仪表盘增加时间范围和粒度记忆。
// @match        *://*/*
${publishMetadataLines.length > 0 ? `${publishMetadataLines.join('\n')}\n` : ''}// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==`;

async function buildUserscriptSource() {
  const parts = await Promise.all(partPaths.map((path) => readFile(path, 'utf8')));
  const sourceParts = parts.join('').replace(
    /const SCRIPT_VERSION = '[^']+';/,
    `const SCRIPT_VERSION = '${scriptVersion}';`,
  );
  return `${header}

(function () {
  'use strict';

${sourceParts}` + '})();\n';
}

const args = new Set(process.argv.slice(2));
const source = await buildUserscriptSource();

if (args.has('--check')) {
  const currentSource = await readFile(outputPath, 'utf8');
  if (currentSource !== source) {
    console.error('dist/sub2api-helper.user.js is out of date. Run: node sub2api/build-userscript.mjs');
    process.exit(1);
  }
  process.exit(0);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source);
