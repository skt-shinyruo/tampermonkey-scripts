import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, 'aihub-supplier-hall.user.js');
const defaultOutputPath = resolve(scriptDir, '..', 'dist', 'aihub-supplier-hall.user.js');

function getArgValue(name) {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const outputPath = resolve(process.cwd(), getArgValue('--output') || defaultOutputPath);
const repoName = process.env.GITHUB_REPOSITORY?.split('/').pop() || 'tampermonkey-scripts';
const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'skt-shinyruo';
const pagesUrl = `https://${repoOwner}.github.io/${repoName}/aihub-supplier-hall.user.js`;
const updateUrl = process.env.AIHUB_UPDATE_URL || pagesUrl;
const downloadUrl = process.env.AIHUB_DOWNLOAD_URL || updateUrl;
const baseVersion = '2.0';
const scriptVersion = process.env.AIHUB_VERSION || `${baseVersion}.0`;

const source = await readFile(sourcePath, 'utf8');
const built = source.replace(
  /^\/\/ @version\s+.*$/m,
  `// @version      ${scriptVersion}`,
).replace(
  '// @grant        none',
  `// @updateURL    ${updateUrl}\n// @downloadURL  ${downloadUrl}\n// @grant        none`,
);

const args = new Set(process.argv.slice(2));
if (args.has('--check')) {
  const currentSource = await readFile(outputPath, 'utf8');
  if (currentSource !== built) {
    console.error('dist/aihub-supplier-hall.user.js is out of date. Run: node aihub/build-userscript.mjs');
    process.exit(1);
  }
  process.exit(0);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, built);
