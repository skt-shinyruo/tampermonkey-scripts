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
  assert.match(source, /\/\/ @grant\s+GM_setValue/);
  assert.match(source, /\/\/ @grant\s+GM_getValue/);
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
      A6API_VERSION: '1.4.99',
    },
    stdio: 'pipe',
  });

  const built = readFileSync(outPath, 'utf8');
  assert.match(built, /\/\/ @version\s+1\.4\.99/);
});

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this._textContent = undefined;
    this.parentNode = null;
    this.eventListeners = {};
    this.style = {};
    this.id = '';
    this._value = '';
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }
  set innerHTML(val) {
    if (val === '') {
      for (const ch of this.children) ch.parentNode = null;
      this.children = [];
      this.textContent = '';
    } else {
      this.textContent = String(val).replace(/<[^>]+>/g, '');
    }
  }
  get innerHTML() {
    return this.textContent;
  }
  get textContent() {
    if (this._textContent !== undefined) return this._textContent;
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join(' ');
    }
    return '';
  }
  set textContent(val) {
    this._textContent = String(val);
  }
  get classList() {
    return {
      contains: (c) => this.className.split(/\s+/).filter(Boolean).includes(c),
      add: (c) => {
        if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim();
      },
      remove: (c) => {
        this.className = this.className.split(/\s+/).filter((x) => x !== c).join(' ');
      },
    };
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'id') this.id = String(v);
  }
  getAttribute(k) {
    if (k === 'id') return this.id || null;
    return this.attributes[k] !== undefined ? this.attributes[k] : null;
  }
  get parentElement() {
    return this.parentNode;
  }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const idx = siblings.indexOf(this);
    return idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
  }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }
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
  cloneNode(deep) {
    const clone = new MockElement(this.tagName);
    clone.className = this.className;
    clone.textContent = this.textContent;
    clone.id = this.id;
    clone.attributes = { ...this.attributes };
    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
  addEventListener(evt, fn) {
    this.eventListeners[evt] = this.eventListeners[evt] || [];
    this.eventListeners[evt].push(fn);
  }
  dispatchEvent(evt) {
    try {
      if (!evt.target) Object.defineProperty(evt, 'target', { value: this, configurable: true });
    } catch (e) {}
    const list = this.eventListeners[evt.type] || [];
    for (const fn of list) fn(evt);
    if (evt.bubbles && this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
      this.parentNode.dispatchEvent(evt);
    }
  }
  click() {
    this.dispatchEvent({
      type: 'click',
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => {},
    });
  }
  focus() {}
  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }
  matches(selector) {
    if (selector.includes(',')) {
      return selector.split(',').some((s) => this.matches(s.trim()));
    }
    if (selector === 'tr') return this.tagName === 'TR';
    if (selector === 'tbody') return this.tagName === 'TBODY';
    if (selector === 'td') return this.tagName === 'TD';
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === 'span') return this.tagName === 'SPAN';
    if (selector === 'div') return this.tagName === 'DIV';
    if (selector === 'input') return this.tagName === 'INPUT';
    if (selector.startsWith('button.')) {
      const cls = selector.slice(7);
      return this.tagName === 'BUTTON' && this.classList.contains(cls);
    }
    if (selector.startsWith('input.')) {
      const cls = selector.slice(6);
      return this.tagName === 'INPUT' && this.classList.contains(cls);
    }
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('[')) {
      const mContains = selector.match(/\[([^^$*=]+)\*="([^"]+)"\]/);
      if (mContains) {
        const val = this.getAttribute(mContains[1]) || (mContains[1] === 'class' ? this.className : null);
        return val ? val.includes(mContains[2]) : false;
      }
      const m = selector.match(/\[([^=\]]+)(?:="([^"]+)")?\]/);
      if (m) {
        const attr = m[1];
        const val = m[2];
        if (val !== undefined) return this.getAttribute(attr) === val;
        return this.getAttribute(attr) !== null;
      }
    }
    return false;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    if (selector.includes(',')) {
      const parts = selector.split(',');
      const set = [];
      for (const p of parts) {
        const sub = this.querySelectorAll(p.trim());
        for (const item of sub) {
          if (!set.includes(item)) set.push(item);
        }
      }
      return set;
    }
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

function createEnvironment(initialHash = '#/merchant/channels', initialStorage = {}, options = {}) {
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

  const gmStore = new Map(Object.entries(initialStorage));
  const observers = [];
  const hashListeners = [];
  const intersectionObservers = [];
  const menuCommands = new Map();

  const hashIdx = initialHash.indexOf('#');
  const parsedHash = hashIdx !== -1 ? initialHash.slice(hashIdx) : initialHash;
  const parsedSearch = initialHash.includes('?')
    ? initialHash.slice(initialHash.indexOf('?'), hashIdx !== -1 ? hashIdx : undefined)
    : '';
  const location = {
    hash: parsedHash,
    href: `https://a6api.com/${initialHash}`,
    search: parsedSearch,
    pathname: '/',
  };
  const localStoreMap = new Map(Object.entries(options.localStorage || {}));
  const mockLocalStorage = {
    getItem: (k) => (localStoreMap.has(k) ? String(localStoreMap.get(k)) : null),
    setItem: (k, v) => localStoreMap.set(k, String(v)),
    removeItem: (k) => localStoreMap.delete(k),
    clear: () => localStoreMap.clear(),
  };

  const windowObj = {
    addEventListener: (evt, fn) => {
      if (evt === 'hashchange') hashListeners.push(fn);
    },
    setTimeout: options.setTimeout || ((fn) => fn()),
    location,
    fetch: options.fetch,
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    HTMLInputElement: {
      prototype: {
        get value() {
          return this._value;
        },
        set value(v) {
          this._value = String(v);
        },
      },
    },
  };

  const context = vm.createContext({
    document,
    window: windowObj,
    unsafeWindow: windowObj,
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    location,
    fetch: options.fetch,
    MutationObserver: class {
      constructor(cb) {
        observers.push(cb);
      }
      observe() {}
    },
    setTimeout: options.setTimeout || ((fn) => fn()),
    setInterval: (fn) => {
      fn();
      return 1;
    },
    clearInterval: () => {},
    encodeURIComponent,
    decodeURIComponent,
    history: { replaceState: () => {} },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    KeyboardEvent: class {
      constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
      }
    },
    GM_openInTab: () => {},
    GM_getValue: (k) => gmStore.get(k),
    GM_setValue: (k, v) => gmStore.set(k, v),
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observed = [];
        intersectionObservers.push(this);
      }
      observe(target) {
        this.observed.push(target);
      }
      unobserve(target) {
        this.observed = this.observed.filter((t) => t !== target);
      }
      disconnect() {
        this.observed = [];
      }
      triggerIntersect(target, isIntersecting = true) {
        this.callback([{ target, isIntersecting }]);
      }
    },
    GM_registerMenuCommand: (name, fn) => {
      menuCommands.set(name, fn);
    },
    console,
  });

  return {
    document,
    body,
    location,
    gmStore,
    intersectionObservers,
    menuCommands,
    triggerMutation: () => observers.forEach((cb) => cb()),
    triggerHashChange: (newHash) => {
      location.hash = newHash;
      location.href = `https://a6api.com/${newHash}`;
      hashListeners.forEach((cb) => cb());
    },
    runScript: () => {
      const source = readFileSync(sourcePath, 'utf8');
      vm.runInContext(source, context);
    },
  };
}

test('a6api script injects enlarged buttons only on online channels', () => {
  const env = createEnvironment('#/merchant/channels');
  const tbody = new MockElement('tbody');
  env.body.appendChild(tbody);

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

  env.runScript();

  const styleEl = env.document.getElementById('a6jump-style');
  assert.ok(styleEl, 'Style element should exist');
  assert.match(styleEl.textContent, /height:24px/);
  assert.match(styleEl.textContent, /padding:0 10px/);
  assert.match(styleEl.textContent, /prefers-color-scheme:dark/);
  assert.equal(name1.querySelectorAll('button').length, 2, 'Online channel should have 2 buttons');
  assert.equal(name2.querySelectorAll('button').length, 0, 'Offline channel should have 0 buttons');

  // Toggle row 1 to offline
  status1.textContent = '已下架';
  env.triggerMutation();
  assert.equal(name1.querySelectorAll('button').length, 0, 'Buttons should be removed when row goes offline');

  // Toggle row 2 to online
  status2.textContent = '已上架';
  env.triggerMutation();
  assert.equal(name2.querySelectorAll('button').length, 2, 'Buttons should be injected when row goes online');
});

test('a6api script syncs online channel with name and description to GM storage', () => {
  const env = createEnvironment('#/merchant/channels');
  const tbody = new MockElement('tbody');
  env.body.appendChild(tbody);

  const tr = new MockElement('tr');
  const tdName = new MockElement('td');
  const nameSpan = new MockElement('span');
  nameSpan.className = 'sc-channel-name';
  nameSpan.textContent = '能能CC-2';
  const descSpan = new MockElement('span');
  descSpan.className = 'sc-channel-desc';
  descSpan.textContent = 'CC Kiro 保智商 保缓存';
  tdName.appendChild(nameSpan);
  tdName.appendChild(descSpan);

  const tdId = new MockElement('td');
  const btnId = new MockElement('button');
  btnId.className = 'sc-mono-id';
  btnId.setAttribute('title', '101');
  tdId.appendChild(btnId);

  const tdStatus = new MockElement('td');
  const statusSpan = new MockElement('span');
  statusSpan.className = 'sc-status-pill';
  statusSpan.textContent = '已上架';
  tdStatus.appendChild(statusSpan);

  tr.appendChild(tdName);
  tr.appendChild(tdId);
  tr.appendChild(tdStatus);
  tbody.appendChild(tr);

  env.runScript();

  const ownedRaw = env.gmStore.get('a6_owned_channels');
  assert.ok(ownedRaw, 'a6_owned_channels should be populated in storage');
  const owned = JSON.parse(ownedRaw);
  assert.equal(owned['101']?.name, '能能CC-2');
  assert.equal(owned['101']?.desc, 'CC Kiro 保智商 保缓存');
  assert.equal(owned['101']?.id, '101');

  // Change status to offline
  statusSpan.textContent = '已下架';
  env.triggerMutation();
  const updatedOwned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(updatedOwned['101']?.delisted, true, 'Offline channel should be marked as delisted in cache');
  assert.equal(updatedOwned['101']?.name, '能能CC-2', 'Offline channel should retain its name');
});

test('a6api market page initializes quick channel drawer with owned and custom channels and handles search and CRUD', () => {
  const initialStorage = {
    a6_owned_channels: JSON.stringify({
      '101': { id: '101', name: '能能CC-2', desc: 'CC Kiro 保智商 保缓存' },
    }),
    a6_custom_channels: JSON.stringify([
      { id: '202', name: '自定义测速', desc: '低延迟备用' },
    ]),
    a6_drawer_open: JSON.stringify(false),
  };

  const env = createEnvironment('#/market', initialStorage);

  // Setup market search elements in body
  const tagChip = new MockElement('button');
  tagChip.className = 'ui-switch-tag';
  tagChip.textContent = '渠道';
  let tagClicked = false;
  tagChip.addEventListener('click', () => {
    tagClicked = true;
    tagChip.classList.add('active');
  });

  const searchInput = new MockElement('input');
  searchInput.className = 'ui-search-field';

  env.body.appendChild(tagChip);
  env.body.appendChild(searchInput);
  // Setup multi-dimensional filter tags (simulating user having filtered by a brand/model)
  const brandAll = new MockElement('button');
  brandAll.className = 'ui-filter-tag';
  brandAll.textContent = '全部品牌 2941家供货';
  let brandAllClicked = false;
  brandAll.addEventListener('click', () => {
    brandAllClicked = true;
    brandAll.classList.add('active');
  });

  const modelAll = new MockElement('button');
  modelAll.className = 'ui-filter-tag';
  modelAll.textContent = '全部';
  let modelAllClicked = false;
  modelAll.addEventListener('click', () => {
    modelAllClicked = true;
    modelAll.classList.add('active');
  });

  const sortRecommend = new MockElement('button');
  sortRecommend.className = 'ui-filter-tag';
  sortRecommend.textContent = '综合推荐 (默认)';
  let sortRecommendClicked = false;
  sortRecommend.addEventListener('click', () => {
    sortRecommendClicked = true;
    sortRecommend.classList.add('active');
  });

  env.body.appendChild(brandAll);
  env.body.appendChild(modelAll);
  env.body.appendChild(sortRecommend);

  env.runScript();

  const trigger = env.document.getElementById('a6-drawer-trigger');
  const panel = env.document.getElementById('a6-drawer-panel');
  assert.ok(trigger, 'Drawer trigger button should exist on market page');
  assert.ok(panel, 'Drawer panel should exist on market page');
  assert.equal(panel.classList.contains('is-open'), false, 'Drawer should be collapsed initially');

  // Open drawer
  trigger.click();
  assert.equal(panel.classList.contains('is-open'), true, 'Drawer should open after click trigger');
  assert.equal(JSON.parse(env.gmStore.get('a6_drawer_open')), true);

  // Verify channels rendered
  const cards = panel.querySelectorAll('.a6-card');
  assert.equal(cards.length, 2, 'Should render 2 channel cards (1 owned, 1 custom)');

  const card101 = cards.find((c) => c.getAttribute('data-cid') === '101');
  assert.ok(card101);
  assert.match(card101.querySelector('.a6-card-name').textContent, /能能CC-2/);
  assert.match(card101.querySelector('.a6-card-id').textContent, /#101/);
  assert.match(card101.querySelector('.a6-card-desc').textContent, /CC Kiro 保智商 保缓存/);

  const card202 = cards.find((c) => c.getAttribute('data-cid') === '202');
  assert.ok(card202);
  assert.match(card202.querySelector('.a6-card-name').textContent, /自定义测速/);
  assert.ok(card202.querySelector('.a6-card-del'), 'Custom card should have delete button');

  // Test click card101 to search
  card101.click();
  assert.equal(tagClicked, true, 'Clicking channel card should click 渠道 switch tag');
  assert.equal(searchInput.value, '101', 'Clicking channel card should set search field to channel ID');
  assert.equal(card101.classList.contains('active'), true, 'Selected card should have active class');
  assert.equal(brandAllClicked, true, 'Clicking channel card should reset brand filter to 全部品牌');
  assert.equal(modelAllClicked, true, 'Clicking channel card should reset model series filter to 全部');
  assert.equal(sortRecommendClicked, true, 'Clicking channel card should reset sort filter to 综合推荐');
  // Test toggle deselect: click card101 again to unselect
  card101.click();
  assert.equal(card101.classList.contains('active'), false, 'Card should be deselected on second click');
  assert.equal(searchInput.value, '', 'Search input should be cleared on deselect');

  // Re-select card101
  card101.click();
  assert.equal(card101.classList.contains('active'), true);

  // Test delete custom card 202
  const delBtn = card202.querySelector('.a6-card-del');
  delBtn.click();
  const customAfterDel = JSON.parse(env.gmStore.get('a6_custom_channels'));
  assert.equal(customAfterDel.length, 0, 'Custom channel should be deleted from storage');

  // Test add custom channel via form
  const addBtn = panel.querySelector('.a6-btn-link');
  addBtn.click();

  const addBox = panel.querySelector('.a6-add-box');
  assert.ok(addBox, 'Add form box should exist');
  const inputs = addBox.querySelectorAll('input');
  assert.equal(inputs.length, 4, 'Add box should have 4 inputs (ID, Name, Desc, Remark)');

  // Test auto-fetch info using ID 101 from owned channels
  inputs[0].value = '101';
  const fetchBtn = addBox.querySelector('.a6-btn-fetch');
  assert.ok(fetchBtn, 'Fetch button should exist in add form');
  fetchBtn.click();
  assert.equal(inputs[1].value, '能能CC-2', 'Fetch should auto-fill name');
  assert.equal(inputs[2].value, 'CC Kiro 保智商 保缓存', 'Fetch should auto-fill desc');

  inputs[0].value = '303';
  inputs[1].value = '极速303';
  inputs[2].value = '全并发保活性';
  inputs[3].value = '生产主力';

  const saveBtn = addBox.querySelector('.a6-btn-primary');
  saveBtn.click();

  const customAfterAdd = JSON.parse(env.gmStore.get('a6_custom_channels'));
  assert.equal(customAfterAdd.length, 1);
  assert.equal(customAfterAdd[0].id, '303');
  assert.equal(customAfterAdd[0].name, '极速303');
  assert.equal(customAfterAdd[0].desc, '全并发保活性');
  const remarksAfterAdd = JSON.parse(env.gmStore.get('a6_channel_remarks'));
  assert.equal(remarksAfterAdd['303'], '生产主力');
  const sideBtn = panel.querySelector('.a6-drawer-tool-btn');
  assert.ok(sideBtn);
  assert.match(sideBtn.textContent, /靠右/);
  sideBtn.click();

  const updatedPanel = env.document.getElementById('a6-drawer-panel');
  assert.equal(updatedPanel.classList.contains('is-side-right'), true);
  assert.equal(JSON.parse(env.gmStore.get('a6_drawer_side')), 'right');
});

test('a6api market drawer defaults to open when no state is saved in storage and supports dual-state edge touchpoint', () => {
  const env = createEnvironment('#/market', {});
  env.runScript();
  const panel = env.document.getElementById('a6-drawer-panel');
  const trigger = env.document.getElementById('a6-drawer-trigger');
  assert.ok(panel);
  assert.ok(trigger);
  assert.equal(panel.classList.contains('is-open'), true, 'Drawer should default to open on first visit');
  assert.equal(panel.classList.contains('is-side-left'), true, 'Drawer should default to left side');
  assert.equal(trigger.classList.contains('is-side-left'), true);
  assert.equal(trigger.classList.contains('is-hidden'), true);
  assert.equal(trigger.textContent.includes('📌 快捷渠道'), true);

  const header = panel.querySelector('.a6-drawer-header');
  assert.ok(header);
  assert.equal(header.classList.contains('is-side-left'), true);

  const closeBtn = panel.querySelector('.a6-drawer-close');
  assert.ok(closeBtn, 'Close button capsule should exist in header');
  assert.equal(closeBtn.textContent.includes('✕ 快捷渠道'), true, 'Close button should mirror trigger text with ✕');

  // Click close button -> panel closes, trigger reveals
  closeBtn.click();
  assert.equal(panel.classList.contains('is-open'), false);
  assert.equal(trigger.classList.contains('is-hidden'), false);
  assert.equal(JSON.parse(env.gmStore.get('a6_drawer_open')), false);

  // Click trigger -> panel opens, trigger hides
  trigger.click();
  assert.equal(panel.classList.contains('is-open'), true);
  assert.equal(trigger.classList.contains('is-hidden'), true);
  assert.equal(JSON.parse(env.gmStore.get('a6_drawer_open')), true);
});

test('a6api market drawer preserves scroll position and avoids re-render on arbitrary DOM mutations', () => {
  const env = createEnvironment('#/market', {});
  env.runScript();

  const content = env.document.querySelector('.a6-drawer-content');
  assert.ok(content);
  content.scrollTop = 150;

  // Simulate an arbitrary page DOM mutation
  const dummy = new MockElement('div');
  env.body.appendChild(dummy);
  env.triggerMutation();

  // Content element must still be the exact same element with the same scrollTop
  const contentAfter = env.document.querySelector('.a6-drawer-content');
  assert.equal(contentAfter, content, 'Drawer content should not be torn down on DOM mutations');
  assert.equal(contentAfter.scrollTop, 150, 'Scroll position should be preserved');
});

test('a6api market drawer toolbar provides clear search and reset marketplace buttons', () => {
  const initialStorage = {
    a6_owned_channels: JSON.stringify({
      '101': { id: '101', name: '能能CC-2', desc: 'CC Kiro 保智商 保缓存' },
    }),
  };
  const env = createEnvironment('#/market', initialStorage);

  const searchInput = new MockElement('input');
  searchInput.className = 'ui-search-field';
  env.body.appendChild(searchInput);

  const tagChip = new MockElement('button');
  tagChip.className = 'ui-switch-tag';
  tagChip.textContent = '渠道';
  tagChip.addEventListener('click', () => tagChip.classList.add('active'));
  env.body.appendChild(tagChip);

  const officialResetBtn = new MockElement('button');
  officialResetBtn.textContent = '⟲ 重置所有筛选';
  let officialResetClicked = false;
  officialResetBtn.addEventListener('click', () => { officialResetClicked = true; });
  env.body.appendChild(officialResetBtn);

  const allBrandsTag = new MockElement('button');
  allBrandsTag.textContent = '全部品牌';
  let allBrandsClicked = false;
  allBrandsTag.addEventListener('click', () => { allBrandsClicked = true; allBrandsTag.classList.add('active'); });
  env.body.appendChild(allBrandsTag);

  const allModelsTag = new MockElement('button');
  allModelsTag.textContent = '全部';
  let allModelsClicked = false;
  allModelsTag.addEventListener('click', () => { allModelsClicked = true; allModelsTag.classList.add('active'); });
  env.body.appendChild(allModelsTag);

  const defaultSortTag = new MockElement('button');
  defaultSortTag.textContent = '综合推荐 (默认)';
  let defaultSortClicked = false;
  defaultSortTag.addEventListener('click', () => { defaultSortClicked = true; defaultSortTag.classList.add('active'); });
  env.body.appendChild(defaultSortTag);

  env.runScript();

  const toolbar = env.document.querySelector('.a6-drawer-toolbar');
  assert.ok(toolbar, 'Toolbar should exist in drawer');

  const clearBtn = toolbar.querySelector('.a6-btn-clear');
  const resetBtn = toolbar.querySelector('.a6-btn-reset');
  assert.ok(clearBtn, 'Clear button should exist');
  assert.ok(resetBtn, 'Reset button should exist');

  // Select a card first
  const card = env.document.querySelector('.a6-card');
  card.click();
  assert.equal(card.classList.contains('active'), true);
  assert.equal(searchInput.value, '101');

  // Test clearBtn: clears input and removes active highlight
  clearBtn.click();
  assert.equal(card.classList.contains('active'), false, 'Card should not be active after clear');
  assert.equal(searchInput.value, '', 'Search input should be empty after clear');

  // Select card again
  card.click();
  assert.equal(card.classList.contains('active'), true);

  // Test resetBtn: clicks official reset, selects all brands, all models, default sort, and clears input
  resetBtn.click();
  assert.equal(card.classList.contains('active'), false);
  assert.equal(searchInput.value, '');
  assert.equal(officialResetClicked, true, 'Official reset button should be clicked');
  assert.equal(allBrandsClicked, true, 'All brands tag should be clicked');
  assert.equal(allModelsClicked, true, 'All models tag should be clicked');
  assert.equal(defaultSortClicked, true, 'Default sort tag should be clicked');
});

test('a6api market drawer channel remarks support inline edit, persistence, and deletion', () => {
  const initialStorage = {
    a6_owned_channels: JSON.stringify({
      '101': { id: '101', name: '能能CC-2', desc: 'CC Kiro 保智商 保缓存' },
    }),
    a6_channel_remarks: JSON.stringify({
      '101': '初始备注测试',
    }),
  };
  const env = createEnvironment('#/market', initialStorage);
  env.runScript();

  const card = env.document.querySelector('.a6-card');
  assert.ok(card);
  const remarkBadge = card.querySelector('.a6-card-remark');
  assert.ok(remarkBadge, 'Remark badge should be rendered on card');
  assert.match(remarkBadge.textContent, /初始备注测试/);

  // Click edit button
  const editBtn = card.querySelector('.a6-card-edit-btn');
  assert.ok(editBtn, 'Edit button should exist');
  editBtn.click();

  const editBox = card.querySelector('.a6-card-editbox');
  assert.ok(editBox, 'Inline edit box should exist');
  assert.notEqual(editBox.style.display, 'none');

  const editInput = editBox.querySelector('input');
  assert.equal(editInput.value, '初始备注测试');

  // Change remark to new value
  editInput.value = '更新后的生产主力';
  const saveBtn = editBox.querySelector('.a6-btn-primary');
  saveBtn.click();

  // Storage updated
  const updatedRemarks = JSON.parse(env.gmStore.get('a6_channel_remarks'));
  assert.equal(updatedRemarks['101'], '更新后的生产主力');

  // Re-check card in refreshed drawer
  const newCard = env.document.querySelector('.a6-card');
  const newBadge = newCard.querySelector('.a6-card-remark');
  assert.match(newBadge.textContent, /更新后的生产主力/);

  // Now clear remark
  const newEditBtn = newCard.querySelector('.a6-card-edit-btn');
  newEditBtn.click();
  const newEditBox = newCard.querySelector('.a6-card-editbox');
  const newEditInput = newEditBox.querySelector('input');
  newEditInput.value = '';
  newEditBox.querySelector('.a6-btn-primary').click();

  const clearedRemarks = JSON.parse(env.gmStore.get('a6_channel_remarks'));
  assert.equal(clearedRemarks['101'], undefined, 'Cleared remark should be removed from storage');
});

test('a6api market page highlights rows matching quick channels by ID and suppresses when searching by channel', () => {
  const initialStorage = {
    a6_owned_channels: JSON.stringify({
      '5973': { id: '5973', name: '能能GPT-1', desc: '稳定不降智' },
    }),
    a6_custom_channels: JSON.stringify([
      { id: '6007', name: '能能CC-2', desc: 'CC Kiro 保智商' }
    ]),
  };
  const env = createEnvironment('#/market', initialStorage);

  const searchInput = new MockElement('input');
  searchInput.className = 'ui-search-field';
  searchInput.value = '';
  env.body.appendChild(searchInput);

  const modelChip = new MockElement('button');
  modelChip.className = 'ui-switch-tag active';
  modelChip.textContent = '模型';
  env.body.appendChild(modelChip);

  const channelChip = new MockElement('button');
  channelChip.className = 'ui-switch-tag';
  channelChip.textContent = '渠道';
  env.body.appendChild(channelChip);

  // Setup market table rows
  const tbody = new MockElement('tbody');

  // Row 1: not in quick channels
  const row1 = new MockElement('tr');
  row1.textContent = 'qwen3.8-flash 高速稳定 渠道 #3831';
  tbody.appendChild(row1);

  // Row 2: matches owned channel 5973
  const row2 = new MockElement('tr');
  row2.textContent = 'deepseek-v4-pro 渠道 #5973 ★★★★★ 5.0';
  tbody.appendChild(row2);

  // Row 2 expanded child: detail pane without channel ID, contains vendor #1268
  const row2Expanded = new MockElement('tr');
  row2Expanded.className = 'ant-table-expanded-row';
  row2Expanded.textContent = '渠道说明 保真 不降智 供应商 #1268 能能AI 详情 计费模式 按量';
  tbody.appendChild(row2Expanded);

  // Row 3: matches custom channel 6007 (unexpanded)
  const row3 = new MockElement('tr');
  row3.textContent = 'claude-3-5-sonnet 渠道 #6007 ★★★★★ 5.0';
  tbody.appendChild(row3);
  // Row 5: normal model row (not in quick channels)
  const row5 = new MockElement('tr');
  row5.textContent = 'gemini-2.5-flash 官方特惠 渠道 #9999';
  tbody.appendChild(row5);


  // Row 4: expanded child row matching 5973
  const row4 = new MockElement('tr');
  row4.className = 'ant-table-expanded-row';
  row4.textContent = '子渠道供货 渠道 #5973';
  tbody.appendChild(row4);
  env.body.appendChild(tbody);

  env.runScript();

  // Initially: search query is empty, model dimension is active
  // Row 2, Row 3, and Row 4 should be highlighted
  assert.equal(row1.classList.contains('a6-market-highlight'), false, 'Row 1 should not be highlighted');
  assert.equal(row2.classList.contains('a6-market-highlight'), true, 'Row 2 (owned 5973) should be highlighted');
  assert.equal(row2.classList.contains('a6-market-highlight-parent'), true, 'Row 2 should be marked as expanded parent');
  assert.equal(row2Expanded.classList.contains('a6-market-highlight'), true, 'Row 2 expanded child should inherit highlight');
  assert.equal(row2Expanded.classList.contains('a6-market-highlight-expanded'), true, 'Row 2 expanded child should have expanded class');
  assert.equal(row3.classList.contains('a6-market-highlight'), true, 'Row 3 (custom 6007) should be highlighted');
  assert.equal(row3.classList.contains('a6-market-highlight-parent'), false, 'Row 3 unexpanded should not have parent class');
  assert.equal(row4.classList.contains('a6-market-highlight'), true, 'Row 4 (expanded 5973) should be highlighted');
  // Search by model text: highlighting should STILL be active
  searchInput.value = 'deepseek';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(row2.classList.contains('a6-market-highlight'), true, 'Highlighting should remain active when searching by model');

  // Now switch to "渠道" dimension with non-empty search: highlighting must be SUPPRESSED
  modelChip.classList.remove('active');
  channelChip.classList.add('active');
  searchInput.value = '5973';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

  assert.equal(row2.classList.contains('a6-market-highlight'), false, 'Row 2 highlight should be suppressed in channel search');
  assert.equal(row2.classList.contains('a6-market-highlight-parent'), false, 'Row 2 parent class should be suppressed');
  assert.equal(row2Expanded.classList.contains('a6-market-highlight'), false, 'Row 2 child highlight should be suppressed');
  assert.equal(row2Expanded.classList.contains('a6-market-highlight-expanded'), false, 'Row 2 child expanded class should be suppressed');
  assert.equal(row3.classList.contains('a6-market-highlight'), false, 'Row 3 highlight should be suppressed in channel search');
  // Clear channel search input: highlighting should restore
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(row2.classList.contains('a6-market-highlight'), true, 'Row 2 should restore highlight when query cleared');
  assert.equal(row2.classList.contains('a6-market-highlight-parent'), true, 'Row 2 should restore parent class');
  assert.equal(row2Expanded.classList.contains('a6-market-highlight-expanded'), true, 'Row 2 child should restore expanded class');
  assert.equal(row3.classList.contains('a6-market-highlight'), true, 'Row 3 should restore highlight when query cleared');
});

test('a6api market page width scaling provides presets, slider, persistence, and dynamic CSS injection', () => {
  const env = createEnvironment('#/market', {});
  env.runScript();

  const widthBar = env.document.querySelector('.a6-drawer-widthbar');
  assert.ok(widthBar, 'Width bar should be rendered in drawer');

  const valDisplay = widthBar.querySelector('.a6-width-val');
  assert.ok(valDisplay);
  assert.equal(valDisplay.textContent, '原版');

  const pills = widthBar.querySelectorAll('.a6-width-pill');
  assert.equal(pills.length, 4, 'Should have 4 preset pills: 原版, 1.35, 1.55, 满宽');

  const numInput = widthBar.querySelector('.a6-width-num-input');
  assert.ok(numInput, 'Direct number input should exist');
  assert.equal(numInput.value, '1.0');

  // Test click '1.35'
  const pill135 = pills.find((p) => p.textContent === '1.35');
  assert.ok(pill135);
  pill135.click();

  assert.equal(JSON.parse(env.gmStore.get('a6_market_width')), '1.35x');
  assert.equal(valDisplay.textContent, '1.35x');
  assert.equal(numInput.value, '1.35');
  assert.equal(pill135.classList.contains('active'), true);

  const styleEl = env.document.getElementById('a6-width-style');
  assert.ok(styleEl, 'Width style element should be injected');
  assert.match(styleEl.textContent, /--a6-market-width:min\(1620px, calc\(100vw - 32px\)\)/);

  // Test click '1.55'
  const pill155 = pills.find((p) => p.textContent === '1.55');
  assert.ok(pill155);
  pill155.click();

  assert.equal(JSON.parse(env.gmStore.get('a6_market_width')), '1.55x');
  assert.equal(valDisplay.textContent, '1.55x');
  assert.equal(numInput.value, '1.55');
  assert.equal(pill155.classList.contains('active'), true);
  assert.match(styleEl.textContent, /--a6-market-width:min\(1860px, calc\(100vw - 32px\)\)/);

  // Test direct number input (e.g. 1.45)
  numInput.value = '1.45';
  numInput.dispatchEvent(new Event('input', { bubbles: true }));
  numInput.dispatchEvent(new Event('change', { bubbles: true }));

  assert.equal(JSON.parse(env.gmStore.get('a6_market_width')), '1.45x');
  assert.equal(valDisplay.textContent, '1.45x');
  assert.match(styleEl.textContent, /--a6-market-width:min\(1740px, calc\(100vw - 32px\)\)/);
  assert.equal(pill155.classList.contains('active'), false);

  // Test click '满宽'
  const pillFull = pills.find((p) => p.textContent === '满宽');
  assert.ok(pillFull);
  pillFull.click();
  assert.equal(JSON.parse(env.gmStore.get('a6_market_width')), 'full');
  assert.equal(valDisplay.textContent, '100% 满宽');
  assert.equal(numInput.value, '');
  assert.match(styleEl.textContent, /--a6-market-width:100%/);

  // Test click '原版' to reset
  const pillDefault = pills.find((p) => p.textContent === '原版');
  pillDefault.click();
  assert.equal(JSON.parse(env.gmStore.get('a6_market_width')), 'default');
  assert.equal(valDisplay.textContent, '原版');
  assert.equal(numInput.value, '1.0');
  assert.equal(styleEl.textContent, '');
});

test('a6api market page supports auto load more setting, toolbar toggle, and intersection observer auto clicking', () => {
  const env = createEnvironment('#/market', {});

  const loadMoreBtn = new MockElement('button');
  loadMoreBtn.textContent = '↓ 加载更多';
  let clickedCount = 0;
  loadMoreBtn.click = () => {
    clickedCount++;
  };
  env.body.appendChild(loadMoreBtn);

  env.runScript();

  // 1. Initial state: auto load is off by default
  const autoBtn = env.document.querySelector('.a6-btn-autoload');
  assert.ok(autoBtn, 'Auto-load button should exist in drawer toolbar');
  assert.equal(autoBtn.textContent.includes('⚡ 自动加载: 关'), true);
  assert.equal(autoBtn.classList.contains('is-active'), false);
  assert.equal(env.intersectionObservers.length, 0, 'No observer before enabling auto-load');

  // 2. Click toolbar button to turn on auto-load
  autoBtn.click();
  assert.equal(autoBtn.textContent.includes('⚡ 自动加载: 开'), true);
  assert.equal(autoBtn.classList.contains('is-active'), true);
  assert.equal(JSON.parse(env.gmStore.get('a6_auto_load_more')), true);

  // Observer should now be created and observing loadMoreBtn
  assert.equal(env.intersectionObservers.length, 1);
  const observer = env.intersectionObservers[0];
  assert.equal(observer.observed.includes(loadMoreBtn), true);

  // 3. Trigger intersection: button should be clicked
  observer.triggerIntersect(loadMoreBtn, true);
  assert.equal(clickedCount, 1, 'Load more button should be clicked on intersection');

  // 4. Cooldown test: immediately trigger again (< 600ms), should not click
  observer.triggerIntersect(loadMoreBtn, true);
  assert.equal(clickedCount, 1, 'Should not click again within 600ms cooldown');

  // 5. Toggle off via GM menu command
  const toggleMenu = env.menuCommands.get('切换市场触底自动加载');
  assert.ok(toggleMenu, 'GM menu command should be registered');
  toggleMenu();

  assert.equal(JSON.parse(env.gmStore.get('a6_auto_load_more')), false);
  assert.equal(observer.observed.length, 0, 'Observer should disconnect when toggled off');

  // 6. Leaving market disconnects observer
  env.triggerHashChange('#/merchant/channels');
  assert.equal(observer.observed.length, 0);
});
test('a6api auto load accurately targets nested load more button without matching outer container divs', () => {
  const env = createEnvironment('#/market', {
    a6_auto_load_more: JSON.stringify(true),
  });

  const footer = new MockElement('div');
  footer.className = 'mp-waterfall-footer';

  const box = new MockElement('div');
  box.className = 'mp-load-more-box';

  const realBtn = new MockElement('button');
  realBtn.className = 'mp-load-more-btn';
  realBtn.textContent = '↓ 加载更多';

  const stat = new MockElement('div');
  stat.className = 'mp-waterfall-stat';
  stat.textContent = '当前已展开 20 条 (第 1 至 20 条, 共 10161 条)';

  box.appendChild(realBtn);
  box.appendChild(stat);
  footer.appendChild(box);
  env.body.appendChild(footer);

  let clicked = false;
  realBtn.click = () => {
    clicked = true;
  };
  footer.click = () => {
    throw new Error('Should not click outer container div');
  };

  env.runScript();

  assert.equal(env.intersectionObservers.length, 1);
  const observer = env.intersectionObservers[0];
  assert.equal(observer.observed[0], realBtn, 'Should observe the real button, not outer divs');

  observer.triggerIntersect(realBtn, true);
  assert.equal(clicked, true, 'Real button should be clicked');
});

test('a6api market page automatically aligns multi-dimensional filters when entering via ?cid=... URL parameter', () => {
  const env = createEnvironment('?cid=5973#/market', {});

  const tagChip = new MockElement('button');
  tagChip.className = 'ui-switch-tag';
  tagChip.textContent = '渠道';
  let tagClicked = false;
  tagChip.addEventListener('click', () => {
    tagClicked = true;
    tagChip.classList.add('active');
  });

  const searchInput = new MockElement('input');
  searchInput.className = 'ui-search-field';

  const brandAll = new MockElement('button');
  brandAll.className = 'ui-filter-tag';
  brandAll.textContent = '全部品牌 2941家供货';
  let brandAllClicked = false;
  brandAll.addEventListener('click', () => {
    brandAllClicked = true;
    brandAll.classList.add('active');
  });

  const modelAll = new MockElement('button');
  modelAll.className = 'ui-filter-tag';
  modelAll.textContent = '全部';
  let modelAllClicked = false;
  modelAll.addEventListener('click', () => {
    modelAllClicked = true;
    modelAll.classList.add('active');
  });

  const sortRecommend = new MockElement('button');
  sortRecommend.className = 'ui-filter-tag';
  sortRecommend.textContent = '综合推荐 (默认)';
  let sortRecommendClicked = false;
  sortRecommend.addEventListener('click', () => {
    sortRecommendClicked = true;
    sortRecommend.classList.add('active');
  });

  env.body.appendChild(tagChip);
  env.body.appendChild(searchInput);
  env.body.appendChild(brandAll);
  env.body.appendChild(modelAll);
  env.body.appendChild(sortRecommend);

  env.runScript();

  assert.equal(brandAllClicked, true, 'Entering via ?cid URL should align brand to 全部品牌');
  assert.equal(modelAllClicked, true, 'Entering via ?cid URL should align model to 全部');
  assert.equal(sortRecommendClicked, true, 'Entering via ?cid URL should align sort to 综合推荐');
  assert.equal(tagClicked, true, 'Entering via ?cid URL should click 渠道 tag');
  assert.equal(searchInput.value, '5973', 'Entering via ?cid URL should set search input to cid');
});

test('a6api custom channel fetch accurately fills channel name and description via marketplace search API', async () => {
  const fakeApiData = {
    data: {
      items: [
        {
          channel_id: 2612,
          channel_name: 'pro-plus混池',
          supplier_name: '树状图算力中心',
          description: 'Azure 官 Key，99%缓存包不降智，请固定',
        },
      ],
    },
  };

  const mockFetch = async (url) => {
    if (url.includes('channel_id=2612')) {
      return {
        ok: true,
        status: 200,
        json: async () => fakeApiData,
      };
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment('#/market', {}, { fetch: mockFetch });

  // DOM has a table with another model as first row (reproducing the bug where grok-4.7 was picked)
  const tbody = new MockElement('tbody');
  const rowGrok = new MockElement('tr');
  const grokName = new MockElement('span');
  grokName.className = 'model-name-text';
  grokName.textContent = 'grok-4.7';
  const grokDesc = new MockElement('span');
  grokDesc.className = 'model-sub-desc';
  grokDesc.textContent = '纯heavy号池，支持工具调用，随意验牌';
  const grokChip = new MockElement('button');
  grokChip.className = 'chip-channel';
  grokChip.textContent = '渠道 #9999';
  rowGrok.appendChild(grokName);
  rowGrok.appendChild(grokDesc);
  rowGrok.appendChild(grokChip);
  tbody.appendChild(rowGrok);
  env.body.appendChild(tbody);

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  assert.ok(panel);

  const addBtn = panel.querySelector('.a6-btn-link');
  addBtn.click();

  const addBox = panel.querySelector('.a6-add-box');
  const inputs = addBox.querySelectorAll('input');
  const fetchBtn = addBox.querySelector('.a6-btn-fetch');

  inputs[0].value = '2612';
  fetchBtn.click();

  // Allow promise tick
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(inputs[1].value, 'pro-plus混池', 'Channel name should be filled from API, not grok-4.7');
  assert.equal(inputs[2].value, 'Azure 官 Key，99%缓存包不降智，请固定', 'Channel desc should be filled from API');
});

test('a6api custom channel fetch falls back to strict row matching in DOM without outer card greedy pollution', async () => {
  const env = createEnvironment('#/market', {});

  // Simulate an outer card container (which triggered the bug with [class*="card"])
  const cardContainer = new MockElement('div');
  cardContainer.className = 'cl-table-card rounded-lg border bg-card';
  env.body.appendChild(cardContainer);

  const tbody = new MockElement('tbody');
  cardContainer.appendChild(tbody);

  // Row 1: grok-4.7 under channel 9999
  const row1 = new MockElement('tr');
  const name1 = new MockElement('span');
  name1.className = 'model-name-text';
  name1.textContent = 'grok-4.7';
  const desc1 = new MockElement('span');
  desc1.className = 'model-sub-desc';
  desc1.textContent = '纯heavy号池，支持工具调用，随意验牌';
  const chip1 = new MockElement('button');
  chip1.className = 'chip-channel';
  chip1.textContent = '渠道 #9999';
  row1.appendChild(name1);
  row1.appendChild(desc1);
  row1.appendChild(chip1);
  tbody.appendChild(row1);

  // Row 2: gpt-6.1-sol under channel 2612
  const row2 = new MockElement('tr');
  const name2 = new MockElement('span');
  name2.className = 'model-name-text';
  name2.textContent = 'gpt-6.1-sol';
  const desc2 = new MockElement('span');
  desc2.className = 'model-sub-desc';
  desc2.textContent = 'Azure 官 Key，99%缓存包不降智，请固定';
  const chip2 = new MockElement('button');
  chip2.className = 'chip-channel';
  chip2.textContent = '渠道 #2612';
  row2.appendChild(name2);
  row2.appendChild(desc2);
  row2.appendChild(chip2);
  tbody.appendChild(row2);

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const addBtn = panel.querySelector('.a6-btn-link');
  addBtn.click();

  const addBox = panel.querySelector('.a6-add-box');
  const inputs = addBox.querySelectorAll('input');
  const fetchBtn = addBox.querySelector('.a6-btn-fetch');

  inputs[0].value = '2612';
  fetchBtn.click();

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(inputs[1].value, 'gpt-6.1-sol', 'DOM fallback should target channel 2612 row, not grok-4.7 from row 1');
  assert.equal(inputs[2].value, 'Azure 官 Key，99%缓存包不降智，请固定');
});

test('a6api custom channel fetch avoids substring channel ID collision', async () => {
  const env = createEnvironment('#/market', {});

  const tbody = new MockElement('tbody');
  const row = new MockElement('tr');
  const name = new MockElement('span');
  name.className = 'model-name-text';
  name.textContent = 'partial-match-model';
  const desc = new MockElement('span');
  desc.className = 'model-sub-desc';
  desc.textContent = 'some description';
  const chip = new MockElement('button');
  chip.className = 'chip-channel';
  chip.textContent = '渠道 #12612';
  row.appendChild(name);
  row.appendChild(desc);
  row.appendChild(chip);
  tbody.appendChild(row);
  env.body.appendChild(tbody);

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const addBtn = panel.querySelector('.a6-btn-link');
  addBtn.click();

  const addBox = panel.querySelector('.a6-add-box');
  const inputs = addBox.querySelectorAll('input');
  const fetchBtn = addBox.querySelector('.a6-btn-fetch');

  inputs[0].value = '2612';
  fetchBtn.click();

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(inputs[1].value, '', '2612 must not match row with channel 12612');
  assert.equal(inputs[2].value, '');
});

test('a6api toolbar sync button updates channels via dual-source sync, detects delisted status, and preserves remarks', async () => {
  const fakeCustomApiDb = {
    '201': {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          items: [
            { channel_id: 201, channel_name: '官方新名', description: '官方新说明' },
          ],
        },
      }),
    },
    '202': {
      ok: true,
      status: 200,
      json: async () => ({
        data: { items: [] }, // 0 items -> delisted
      }),
    },
  };

  const mockFetch = async (url) => {
    if (url.includes('/api/supplier/me/channels')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: 101, name: '新能能CC-2', description: '最新强力高缓', status: 1 },
          { id: 102, name: '下架渠道', description: '下架前说明', status: 0 },
        ],
      };
    }
    const match = url.match(/channel_id=(\d+)/);
    const cid = match ? match[1] : '';
    if (fakeCustomApiDb[cid]) {
      return fakeCustomApiDb[cid];
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_owned_channels: JSON.stringify({
        '101': { id: '101', name: '旧能能CC-2', desc: '旧说明', updatedAt: 1000 },
        '102': { id: '102', name: '下架渠道', desc: '下架前说明', updatedAt: 1000 },
      }),
      a6_custom_channels: JSON.stringify([
        { id: '201', name: '自定义旧名', desc: '自定义旧说明', updatedAt: 1000 },
        { id: '202', name: '下架自定义', desc: '下架自定义说明', updatedAt: 1000 },
      ]),
      a6_channel_remarks: JSON.stringify({
        '101': '重要的个人备注',
        '102': '下架渠道备注',
        '201': '自选重要备注',
        '202': '下架自选备注',
      }),
      a6_drawer_open: JSON.stringify(true),
    },
    { fetch: mockFetch },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  assert.ok(panel);

  const syncBtn = panel.querySelector('.a6-btn-sync');
  assert.ok(syncBtn, 'Sync button should exist in toolbar');

  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const owned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(owned['101'].name, '新能能CC-2', 'Owned channel name should be updated from supplier API');
  assert.equal(owned['101'].desc, '最新强力高缓', 'Owned channel desc should be updated');
  assert.equal(owned['101'].delisted, false);

  assert.equal(owned['102'].delisted, true, 'Channel with status !== 1 should be marked delisted');
  assert.equal(owned['102'].name, '下架渠道', 'Delisted channel should preserve its original name');

  const custom = JSON.parse(env.gmStore.get('a6_custom_channels'));
  const c201 = custom.find((c) => String(c.id) === '201');
  assert.ok(c201);
  assert.equal(c201.name, '官方新名', 'Custom channel name should be updated to official');
  assert.equal(c201.desc, '官方新说明');
  assert.equal(c201.delisted, false);

  const c202 = custom.find((c) => String(c.id) === '202');
  assert.ok(c202);
  assert.equal(c202.delisted, true, 'Custom channel with 0 items should be marked delisted');

  // Channel remarks preserved
  const remarks = JSON.parse(env.gmStore.get('a6_channel_remarks'));
  assert.equal(remarks['101'], '重要的个人备注');
  assert.equal(remarks['102'], '下架渠道备注');
  assert.equal(remarks['201'], '自选重要备注');
  assert.equal(remarks['202'], '下架自选备注');

  // Check DOM rendering of delisted badge
  const cards = env.document.querySelectorAll('.a6-card');
  const card102 = cards.find((c) => c.getAttribute('data-cid') === '102');
  assert.ok(card102);
  assert.ok(card102.className.includes('is-delisted'), 'Delisted card should have is-delisted class');
  const badge102 = card102.querySelector('.a6-card-delisted');
  assert.ok(badge102, 'Delisted card should display [已下架] badge');
  assert.equal(badge102.textContent, '已下架');

  const card101 = cards.find((c) => c.getAttribute('data-cid') === '101');
  assert.ok(card101);
  assert.ok(!card101.className.includes('is-delisted'));
  assert.equal(card101.querySelector('.a6-card-delisted'), null);
});

test('a6api passive channel sync respects 2-hour TTL and updates stale channel on card click', async () => {
  const fetched = [];
  const mockFetch = async (url) => {
    const match = url.match(/channel_id=(\d+)/);
    const cid = match ? match[1] : '';
    fetched.push(cid);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          items: [
            { channel_id: Number(cid), channel_name: 'Name ' + cid, description: 'Desc ' + cid },
          ],
        },
      }),
    };
  };

  const now = Date.now();
  const env = createEnvironment(
    '#/market',
    {
      a6_custom_channels: JSON.stringify([
        { id: '201', name: 'Fresh', desc: 'Fresh', updatedAt: now - 30 * 60 * 1000 }, // 30m ago (< 2h)
        { id: '202', name: 'Stale', desc: 'Stale', updatedAt: now - 3 * 3600 * 1000 }, // 3h ago (> 2h)
      ]),
      a6_drawer_open: JSON.stringify(true),
    },
    { fetch: mockFetch },
  );

  env.runScript();

  const cards = env.document.querySelectorAll('.a6-card');
  // Click fresh card (201)
  const card201 = cards.find((c) => c.getAttribute('data-cid') === '201');
  assert.ok(card201);
  card201.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(!fetched.includes('201'), 'Passive sync should skip custom channel updated < 2 hours ago');

  // Click stale card (202)
  const card202 = cards.find((c) => c.getAttribute('data-cid') === '202');
  assert.ok(card202);
  card202.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(fetched.includes('202'), 'Passive sync should trigger for custom channel updated > 2 hours ago');

  const custom = JSON.parse(env.gmStore.get('a6_custom_channels'));
  const c202 = custom.find((c) => String(c.id) === '202');
  assert.equal(c202.name, 'Name 202');
  assert.equal(c202.desc, 'Desc 202');
});

test('a6api toolbar sync heals polluted "Channel ID 101" names using supplier me channels', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/api/supplier/me/channels')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: 101, name: '能能CC-2', description: '高智商高缓存', status: 1 },
        ],
      };
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_owned_channels: JSON.stringify({
        '101': { id: '101', name: 'Channel ID 101', desc: '', updatedAt: 1000 },
      }),
      a6_drawer_open: JSON.stringify(true),
    },
    { fetch: mockFetch },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const syncBtn = panel.querySelector('.a6-btn-sync');
  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const owned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(owned['101'].name, '能能CC-2', 'Polluted "Channel ID 101" should be healed to real name');
  assert.equal(owned['101'].desc, '高智商高缓存');
});

test('a6api sync preserves user custom channel name when public search returns anonymized placeholder', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/api/supplier/me/channels')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes('channel_id=301')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: [
              { channel_id: 301, channel_name: 'Channel ID 301', description: '最新描述' },
            ],
          },
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_custom_channels: JSON.stringify([
        { id: '301', name: '生产主力', desc: '旧描述', updatedAt: 1000 },
      ]),
      a6_drawer_open: JSON.stringify(true),
    },
    { fetch: mockFetch },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const syncBtn = panel.querySelector('.a6-btn-sync');
  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const custom = JSON.parse(env.gmStore.get('a6_custom_channels'));
  const ch301 = custom.find((c) => String(c.id) === '301');
  assert.equal(ch301.name, '生产主力', 'Existing custom channel name must not be overwritten by "Channel ID 301" placeholder');
  assert.equal(ch301.desc, '最新描述', 'Description should be updated');
});

test('a6api toolbar sync gracefully indicates unauthorized merchant status when not logged in', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/api/supplier/me/channels')) {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          code: 'dashboard_auth_required',
          message: 'Unauthorized',
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_owned_channels: JSON.stringify({
        '101': { id: '101', name: '保密主力', desc: '保持不变', updatedAt: 1000 },
      }),
      a6_drawer_open: JSON.stringify(true),
    },
    {
      fetch: mockFetch,
      setTimeout: (fn, delay) => {
        if (delay && delay >= 1000) return 0;
        return fn();
      },
    },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const syncBtn = panel.querySelector('.a6-btn-sync');
  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const curBtn = env.document.querySelector('.a6-btn-sync');
  assert.ok(curBtn);
  assert.match(curBtn.innerHTML, /商户未登录/);
  const owned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(owned['101'].name, '保密主力', 'Owned channel name must remain intact when merchant unauthorized');
});

test('a6api sync preserves channel state on API network errors or server exceptions', async () => {
  const mockFetch = async () => {
    throw new Error('Network offline');
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_owned_channels: JSON.stringify({
        '101': { id: '101', name: '能能CC', desc: '稳定', delisted: false, updatedAt: 1000 },
      }),
      a6_drawer_open: JSON.stringify(true),
    },
    { fetch: mockFetch },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const syncBtn = panel.querySelector('.a6-btn-sync');
  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const owned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(owned['101'].name, '能能CC', 'Name should be preserved on network error');
  assert.equal(owned['101'].desc, '稳定', 'Desc should be preserved on network error');
  assert.equal(owned['101'].delisted, false, 'Channel should NOT be marked delisted on network error');
});

test('a6api toolbar sync sends New-Api-User header resolved from storage or session', async () => {
  let capturedHeaders = null;
  const mockFetch = async (url, opts) => {
    if (url.includes('/api/supplier/me/channels')) {
      capturedHeaders = opts && opts.headers ? opts.headers : {};
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: 5973, name: '能能GPT-1', description: '稳定不降智 高并发', status: 1 },
        ],
      };
    }
    return { ok: false, status: 404 };
  };

  const env = createEnvironment(
    '#/market',
    {
      a6_owned_channels: JSON.stringify({
        '5973': { id: '5973', name: '旧名称', desc: '旧说明', updatedAt: 1000 },
      }),
      a6_drawer_open: JSON.stringify(true),
    },
    {
      fetch: mockFetch,
      localStorage: {
        a6api_session_user_id: '12345',
      },
    },
  );

  env.runScript();

  const panel = env.document.getElementById('a6-drawer-panel');
  const syncBtn = panel.querySelector('.a6-btn-sync');
  syncBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(capturedHeaders, 'Request to /api/supplier/me/channels should be made');
  assert.equal(capturedHeaders['New-Api-User'], '12345', 'New-Api-User header must be passed from localStorage');

  const owned = JSON.parse(env.gmStore.get('a6_owned_channels'));
  assert.equal(owned['5973'].name, '能能GPT-1', 'Channel name should be updated successfully');
});
