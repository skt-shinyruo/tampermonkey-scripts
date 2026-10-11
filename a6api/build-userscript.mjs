import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, 'a6api-channel-market-search.user.js');
const defaultOutputPath = resolve(scriptDir, '..', 'dist', 'a6api-channel-market-search.user.js');

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
const pagesUrl = `https://${repoOwner}.github.io/${repoName}/a6api-channel-market-search.user.js`;
const updateUrl = process.env.A6API_UPDATE_URL || pagesUrl;
const downloadUrl = process.env.A6API_DOWNLOAD_URL || updateUrl;
const baseVersion = '1.3';
const scriptVersion = process.env.A6API_VERSION || `${baseVersion}.1`;

const source = await readFile(sourcePath, 'utf8');
const publishMetadataLines = [
  updateUrl ? `// @updateURL    ${updateUrl}` : '',
  downloadUrl ? `// @downloadURL  ${downloadUrl}` : '',
].filter(Boolean);

let built = source.replace(
  /^\/\/ @version\s+.*$/m,
  `// @version      ${scriptVersion}`,
);

if (publishMetadataLines.length > 0) {
  built = built.replace(
    /(\/\/ @grant)/,
    `${publishMetadataLines.join('\n')}\n$1`,
  );
}

const args = new Set(process.argv.slice(2));
if (args.has('--check')) {
  const currentSource = await readFile(outputPath, 'utf8');
  if (currentSource !== built) {
    console.error('dist/a6api-channel-market-search.user.js is out of date. Run: node a6api/build-userscript.mjs');
    process.exit(1);
  }
  process.exit(0);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, built);
