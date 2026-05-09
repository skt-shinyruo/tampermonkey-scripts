# Linuxdo Autoversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the linuxdo userscript publish with an automatically increasing `@version` so Greasy Fork and userscript managers pick up each CI release.

**Architecture:** Keep the checked-in linuxdo source file as the human-edited source of truth with a baseline version. Move the release version to the build step, where CI passes `LINUXDO_VERSION=0.1.${GITHUB_RUN_NUMBER}` and the build script rewrites the metadata header before writing `dist/linuxdo-open-links-new-tab.user.js`. Linuxdo does not need a runtime `SCRIPT_VERSION` constant, so the change stays limited to metadata, build, workflow, tests, and docs.

**Tech Stack:** Node.js, GitHub Actions, Node test runner, shell env vars.

---

### Task 1: Add a regression test for build-time version injection

**Files:**
- Modify: `linuxdo/linuxdo-open-links-new-tab.user.test.mjs:1-46`

- [ ] **Step 1: Write the failing test**

```js
test('linuxdo build script applies LINUXDO_VERSION to @version', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'linuxdo-build-'));
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test --test-name-pattern="linuxdo build script applies LINUXDO_VERSION to @version" linuxdo/linuxdo-open-links-new-tab.user.test.mjs
```
Expected: FAIL because the build script still emits `0.1.0`.

- [ ] **Step 3: Keep the test in place**

Do not weaken the assertion to match the source file. The test must inspect the built output.

### Task 2: Teach the build script to use `LINUXDO_VERSION`

**Files:**
- Modify: `linuxdo/build-userscript.mjs:1-41`

- [ ] **Step 1: Implement minimal version interpolation**

```js
const baseVersion = '0.1';
const scriptVersion = process.env.LINUXDO_VERSION || `${baseVersion}.0`;
```

Replace the metadata version line during build:

```js
const built = source
  .replace('// @version      0.1.0', `// @version      ${scriptVersion}`)
  .replace(
    '// @grant        none',
    `// @updateURL    ${updateUrl}\n// @downloadURL  ${downloadUrl}\n// @grant        none`,
  );
```

- [ ] **Step 2: Run the targeted test**

Run:
```bash
node --test --test-name-pattern="linuxdo build script applies LINUXDO_VERSION to @version" linuxdo/linuxdo-open-links-new-tab.user.test.mjs
```
Expected: PASS.

- [ ] **Step 3: Verify default builds still work**

Run:
```bash
node linuxdo/build-userscript.mjs
node --check dist/linuxdo-open-links-new-tab.user.js
```
Expected: PASS, with default version `0.1.0` when `LINUXDO_VERSION` is unset.

### Task 3: Pass the CI-generated version through GitHub Actions

**Files:**
- Modify: `.github/workflows/linuxdo-pages.yml:41-46`

- [ ] **Step 1: Inject the generated version in the build step**

```yaml
      - name: Build userscript
        run: |
          script_url="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/build/linuxdo-open-links-new-tab.user.js"
          LINUXDO_VERSION="0.1.${GITHUB_RUN_NUMBER}" \
          LINUXDO_UPDATE_URL="$script_url" \
          LINUXDO_DOWNLOAD_URL="$script_url" \
          node linuxdo/build-userscript.mjs --output=dist/linuxdo-open-links-new-tab.user.js
```

- [ ] **Step 2: Run a local dry-run equivalent**

Run:
```bash
LINUXDO_VERSION=0.1.999 LINUXDO_UPDATE_URL=https://example.invalid LINUXDO_DOWNLOAD_URL=https://example.invalid node linuxdo/build-userscript.mjs --output=/tmp/linuxdo-open-links-new-tab.user.js
sed -n '1,12p' /tmp/linuxdo-open-links-new-tab.user.js
```
Expected: `@version 0.1.999` in the generated header.

### Task 4: Document the new release behavior

**Files:**
- Modify: `linuxdo/README.md:19-26`

- [ ] **Step 1: Update the build instructions**

Add the CI version convention:

```bash
LINUXDO_VERSION="0.1.${GITHUB_RUN_NUMBER}" \
LINUXDO_UPDATE_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/linuxdo-open-links-new-tab.user.js" \
LINUXDO_DOWNLOAD_URL="https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/linuxdo-open-links-new-tab.user.js" \
node linuxdo/build-userscript.mjs --output=dist/linuxdo-open-links-new-tab.user.js
```

- [ ] **Step 2: Note that source keeps the baseline version**

Add one sentence explaining that `linuxdo-open-links-new-tab.user.js` keeps a baseline `@version`, while CI injects the release version into the built artifact.

### Task 5: Verify the full linuxdo chain and commit

**Files:**
- Modified: `linuxdo/build-userscript.mjs`
- Modified: `linuxdo/linuxdo-open-links-new-tab.user.test.mjs`
- Modified: `.github/workflows/linuxdo-pages.yml`
- Modified: `linuxdo/README.md`

- [ ] **Step 1: Run the full linuxdo test suite**

Run:
```bash
node --test linuxdo/linuxdo-open-links-new-tab.user.test.mjs
```
Expected: PASS.

- [ ] **Step 2: Run syntax and build checks**

Run:
```bash
node --check linuxdo/build-userscript.mjs
node linuxdo/build-userscript.mjs --check
node --check dist/linuxdo-open-links-new-tab.user.js
```
Expected: PASS.

- [ ] **Step 3: Commit and push**

```bash
git add linuxdo/build-userscript.mjs linuxdo/linuxdo-open-links-new-tab.user.test.mjs .github/workflows/linuxdo-pages.yml linuxdo/README.md
git commit -m "Auto version linuxdo userscript builds"
git push origin main
```
