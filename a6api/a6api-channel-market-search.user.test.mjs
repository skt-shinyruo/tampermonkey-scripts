import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

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

test('a6api script injects enlarged buttons only on online channels', () => {
  const source = readFileSync(sourcePath, 'utf8');

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.className = '';
      this.textContent = '';
      this.parentNode = null;
      this.eventListeners = {};
    }
    get classList() {
      return {
        contains: (c) => this.className.split(/\s+/).includes(c),
        add: (c) => { if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim(); },
        remove: (c) => { this.className = this.className.split(/\s+/).filter((x) => x !== c).join(' '); }
      };
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    }
    addEventListener(evt, fn) {
      this.eventListeners[evt] = this.eventListeners[evt] || [];
      this.eventListeners[evt].push(fn);
    }
    closest(selector) {
      let curr = this;
      while (curr) {
        if (curr.matches(selector)) return curr;
        curr = curr.parentNode;
      }
      return null;
    }
    matches(selector) {
      if (selector === 'tr') return this.tagName === 'TR';
      if (selector === 'tbody') return this.tagName === 'TBODY';
      if (selector === 'button') return this.tagName === 'BUTTON';
      if (selector.startsWith('button.')) {
        const cls = selector.slice(7);
        return this.tagName === 'BUTTON' && this.classList.contains(cls);
      }
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('[')) {
        const m = selector.match(/\[([^=\]]+)(?:="([^"]+)")?\]/);
        if (m) {
          const attr = m[1];
          const val = m[2];
          if (val !== undefined) return this.attributes[attr] === val;
          return attr in this.attributes;
        }
      }
      return false;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
      if (selector === 'tbody tr') {
        const list = [];
        const tbodies = this.querySelectorAll('tbody');
        for (const tb of tbodies) {
          for (const ch of tb.children) {
            if (ch.tagName === 'TR') list.push(ch);
          }
        }
        return list;
      }
      const res = [];
      const walk = (node) => {
        for (const ch of node.children) {
          if (ch.matches(selector)) res.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return res;
    }
  }

  const document = new MockElement('document');
  const html = new MockElement('html');
  const head = new MockElement('head');
  const body = new MockElement('body');
  document.appendChild(html);
  html.appendChild(head);
  html.appendChild(body);
  document.head = head;
  document.body = body;
  document.documentElement = html;
  document.getElementById = (id) => {
    const walk = (n) => {
      if (n.id === id) return n;
      for (const c of n.children) {
        const found = walk(c);
        if (found) return found;
      }
      return null;
    };
    return walk(document);
  };
  document.createElement = (tag) => new MockElement(tag);

  const tbody = new MockElement('tbody');
  body.appendChild(tbody);

  // Row 1: online channel
  const tr1 = new MockElement('tr');
  const td1Name = new MockElement('td');
  const name1 = new MockElement('span');
  name1.className = 'sc-channel-name';
  name1.textContent = 'Channel Online';
  td1Name.appendChild(name1);
  const td1Id = new MockElement('td');
  const btn1 = new MockElement('button');
  btn1.className = 'sc-mono-id';
  btn1.setAttribute('title', 'id-101');
  td1Id.appendChild(btn1);
  const td1Status = new MockElement('td');
  const status1 = new MockElement('span');
  status1.className = 'sc-status-pill';
  status1.textContent = '已上架';
  td1Status.appendChild(status1);
  tr1.appendChild(td1Name);
  tr1.appendChild(td1Id);
  tr1.appendChild(td1Status);
  tbody.appendChild(tr1);

  // Row 2: offline channel
  const tr2 = new MockElement('tr');
  const td2Name = new MockElement('td');
  const name2 = new MockElement('span');
  name2.className = 'sc-channel-name';
  name2.textContent = 'Channel Offline';
  td2Name.appendChild(name2);
  const td2Id = new MockElement('td');
  const btn2 = new MockElement('button');
  btn2.className = 'sc-mono-id';
  btn2.setAttribute('title', 'id-102');
  td2Id.appendChild(btn2);
  const td2Status = new MockElement('td');
  const status2 = new MockElement('span');
  status2.className = 'sc-status-pill';
  status2.textContent = '已下架';
  td2Status.appendChild(status2);
  tr2.appendChild(td2Name);
  tr2.appendChild(td2Id);
  tr2.appendChild(td2Status);
  tbody.appendChild(tr2);

  let observerCallback = null;
  class MockMutationObserver {
    constructor(cb) { observerCallback = cb; }
    observe() {}
  }

  const windowObj = {
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
    location: { hash: '#/merchant/channels', href: 'https://a6api.com/#/merchant/channels', search: '' }
  };

  const context = vm.createContext({
    document,
    window: windowObj,
    location: windowObj.location,
    MutationObserver: MockMutationObserver,
    setTimeout: (fn) => fn(),
    encodeURIComponent,
    GM_openInTab: () => {},
    console
  });

  vm.runInContext(source, context);

  const styleEl = document.getElementById('a6jump-style');
  assert.ok(styleEl, 'Style element should exist');
  assert.match(styleEl.textContent, /height:24px/);
  assert.match(styleEl.textContent, /padding:0 10px/);

  assert.equal(name1.querySelectorAll('button').length, 2, 'Online channel should have 2 buttons');
  assert.equal(name2.querySelectorAll('button').length, 0, 'Offline channel should have 0 buttons');

  // Toggle row 1 to offline
  status1.textContent = '已下架';
  observerCallback();
  assert.equal(name1.querySelectorAll('button').length, 0, 'Buttons should be removed when row goes offline');

  // Toggle row 2 to online
  status2.textContent = '已上架';
  observerCallback();
  assert.equal(name2.querySelectorAll('button').length, 2, 'Buttons should be injected when row goes online');
});
