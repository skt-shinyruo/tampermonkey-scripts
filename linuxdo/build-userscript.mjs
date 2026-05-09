import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, 'linuxdo-open-links-new-tab.user.js');
const defaultOutputPath = resolve(scriptDir, '..', 'dist', 'linuxdo-open-links-new-tab.user.js');

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
const pagesUrl = `https://${repoOwner}.github.io/${repoName}/linuxdo-open-links-new-tab.user.js`;
const updateUrl = process.env.LINUXDO_UPDATE_URL || pagesUrl;
const downloadUrl = process.env.LINUXDO_DOWNLOAD_URL || updateUrl;

const source = await readFile(sourcePath, 'utf8');
const built = source.replace(
  '// @grant        none',
  `// @updateURL    ${updateUrl}\n// @downloadURL  ${downloadUrl}\n// @grant        none`,
);

const args = new Set(process.argv.slice(2));
if (args.has('--check')) {
  const currentSource = await readFile(outputPath, 'utf8');
  if (currentSource !== built) {
    console.error('dist/linuxdo-open-links-new-tab.user.js is out of date. Run: node linuxdo/build-userscript.mjs');
    process.exit(1);
  }
  process.exit(0);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, built);
