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
    this.textContent = '';
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
    const list = this.eventListeners[evt.type] || [];
    for (const fn of list) fn(evt);
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

function createEnvironment(initialHash = '#/merchant/channels', initialStorage = {}) {
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

  const location = {
    hash: initialHash,
    href: `https://a6api.com/${initialHash}`,
    search: '',
    pathname: '/',
  };

  const windowObj = {
    addEventListener: (evt, fn) => {
      if (evt === 'hashchange') hashListeners.push(fn);
    },
    setTimeout: (fn) => fn(),
    location,
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
    location,
    MutationObserver: class {
      constructor(cb) {
        observers.push(cb);
      }
      observe() {}
    },
    setTimeout: (fn) => fn(),
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
    console,
  });

  return {
    document,
    body,
    location,
    gmStore,
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
  assert.equal(updatedOwned['101'], undefined, 'Offline channel should be removed from cache');
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
  assert.match(sideBtn.textContent, /靠左/);
  sideBtn.click();

  const updatedPanel = env.document.getElementById('a6-drawer-panel');
  assert.equal(updatedPanel.classList.contains('is-side-left'), true);
  assert.equal(JSON.parse(env.gmStore.get('a6_drawer_side')), 'left');
});

test('a6api market drawer defaults to open when no state is saved in storage', () => {
  const env = createEnvironment('#/market', {});
  env.runScript();
  const panel = env.document.getElementById('a6-drawer-panel');
  assert.ok(panel);
  assert.equal(panel.classList.contains('is-open'), true, 'Drawer should default to open on first visit');
  assert.equal(panel.classList.contains('is-side-right'), true, 'Drawer should default to right side');
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
