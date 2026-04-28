import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const scriptPath = new URL('./sub2api-helper.user.js', import.meta.url);
const source = await readFile(scriptPath, 'utf8');
const RealDate = Date;

function splitClassNames(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function formatCustomLabel(dateText) {
  const [year, month, day] = String(dateText || '')
    .split('-')
    .map(Number);
  if (!year || !month || !day) {
    return '';
  }
  return `${month}月${day}日`;
}

function buildCustomDisplayText(start, end) {
  return `${formatCustomLabel(start)} - ${formatCustomLabel(end)}`;
}

function getDatasetKeyFromSelector(selector) {
  const match = selector.match(/^\[data-([a-z0-9-]+)="true"\]$/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function getAttributeSelectorMatch(selector) {
  const match = selector.match(/^([a-z]+)\[([^=]+)="([^"]+)"\]$/i);
  if (!match) {
    return null;
  }
  return {
    attribute: match[2],
    tagName: match[1].toUpperCase(),
    value: match[3],
  };
}

function getTagAndClassSelectorMatch(selector) {
  const match = selector.match(/^([a-z]+)\.([a-z0-9_-]+)$/i);
  if (!match) {
    return null;
  }
  return {
    className: match[2],
    tagName: match[1].toUpperCase(),
  };
}

function matchesSelector(element, selector) {
  const normalizedSelector = selector.trim();
  if (!normalizedSelector) {
    return false;
  }

  if (normalizedSelector.includes(',')) {
    return normalizedSelector.split(',').some((part) => matchesSelector(element, part));
  }

  const datasetKey = getDatasetKeyFromSelector(normalizedSelector);
  if (datasetKey) {
    return element.dataset?.[datasetKey] === 'true';
  }

  const attributeSelector = getAttributeSelectorMatch(normalizedSelector);
  if (attributeSelector) {
    return (
      element.tagName === attributeSelector.tagName &&
      String(element.attributes[attributeSelector.attribute] ?? '') === attributeSelector.value
    );
  }

  const tagAndClassSelector = getTagAndClassSelectorMatch(normalizedSelector);
  if (tagAndClassSelector) {
    return (
      element.tagName === tagAndClassSelector.tagName &&
      splitClassNames(element.className).includes(tagAndClassSelector.className)
    );
  }

  if (normalizedSelector.startsWith('.')) {
    return splitClassNames(element.className).includes(normalizedSelector.slice(1));
  }

  if (/^[a-z]+$/i.test(normalizedSelector)) {
    return element.tagName === normalizedSelector.toUpperCase();
  }

  if (normalizedSelector === '[role="option"]') {
    return element.attributes.role === 'option';
  }

  return false;
}

class TestElement {
  constructor(tagName = 'div', textContent = '') {
    this.tagName = tagName.toUpperCase();
    this._textContent = textContent;
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.disabled = false;
    this.isConnected = true;
    this.listeners = new Map();
    this.ownerDocument = null;
    this.parentElement = null;
    this.style = {};
  }

  get classList() {
    return {
      add: (...tokens) => {
        const classNames = new Set(splitClassNames(this.className));
        for (const token of tokens) {
          classNames.add(token);
        }
        this.className = [...classNames].join(' ');
      },
      contains: (token) => splitClassNames(this.className).includes(token),
      remove: (...tokens) => {
        const removalSet = new Set(tokens);
        this.className = splitClassNames(this.className)
          .filter((token) => !removalSet.has(token))
          .join(' ');
      },
    };
  }

  set textContent(value) {
    this._textContent = String(value);
    if (value === '') {
      for (const child of this.children) {
        child.parentElement = null;
      }
      this.children = [];
    }
  }

  get textContent() {
    if (!this.children.length) {
      return this._textContent;
    }
    return this.children.map((child) => child.textContent).join('');
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  contains(target) {
    let current = target;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  dispatchEvent(event) {
    const actualEvent = {
      stopPropagation() {},
      target: this,
      ...event,
    };
    const handlers = this.listeners.get(actualEvent.type) || [];
    for (const handler of handlers) {
      handler(actualEvent);
    }
    return true;
  }

  insertAdjacentElement(position, element) {
    if (position !== 'afterend' || !this.parentElement) {
      return null;
    }
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    element.parentElement = this.parentElement;
    element.ownerDocument = this.ownerDocument;
    siblings.splice(index + 1, 0, element);
    return element;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  remove() {
    this.isConnected = false;
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

class TestInputElement extends TestElement {
  constructor() {
    super('input');
    this._value = '';
  }

  set value(nextValue) {
    this._value = String(nextValue);
  }

  get value() {
    return this._value;
  }
}

class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
  }

  stopPropagation() {}
}

function getIntervalDurations(intervals) {
  return [...intervals.values()]
    .map(({ ms }) => ms)
    .sort((left, right) => left - right);
}

async function flushMicrotasks(times = 80) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function createTestEnvironment({
  gmValues = {},
  now = 0,
  origin = 'https://codex.ciii.club',
  pathname = '/usage',
  savedAutoRefreshValue = 'off',
} = {}) {
  let currentTime = now;
  let focused = true;
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  const documentListeners = new Map();
  const gmState = new Map(Object.entries(gmValues));
  const intervals = new Map();
  const localStorageState = new Map();
  const mutationObservers = new Set();
  const fetchCalls = [];
  const windowListeners = new Map();

  const autoRefreshStorageKey = `sub2api-helper:${origin}:auto-refresh-ms`;
  if (!gmState.has(autoRefreshStorageKey)) {
    gmState.set(autoRefreshStorageKey, savedAutoRefreshValue);
  }

  const html = new TestElement('html');
  const body = new TestElement('body');
  html.appendChild(body);

  const actionRow = new TestElement('div');
  const refreshButton = new TestElement('button', '刷新');
  refreshButton.clickCount = 0;
  refreshButton.click = function clickRefresh() {
    this.clickCount += 1;
    TestElement.prototype.click.call(this);
  };
  actionRow.appendChild(refreshButton);
  body.appendChild(actionRow);

  const location = {
    href: `${origin}${pathname}`,
    origin,
    pathname,
  };

  const document = {
    addEventListener(type, handler) {
      const handlers = documentListeners.get(type) || [];
      handlers.push(handler);
      documentListeners.set(type, handlers);
    },
    body,
    createElement(tagName) {
      const normalizedTagName = String(tagName).toLowerCase();
      const element = normalizedTagName === 'input' ? new TestInputElement() : new TestElement(tagName);
      element.ownerDocument = document;
      return element;
    },
    documentElement: html,
    hasFocus() {
      return focused;
    },
    querySelector(selector) {
      return html.querySelector(selector);
    },
    querySelectorAll(selector) {
      return html.querySelectorAll(selector);
    },
    visibilityState: 'visible',
  };

  html.ownerDocument = document;
  body.ownerDocument = document;
  actionRow.ownerDocument = document;
  refreshButton.ownerDocument = document;

  const setIntervalImpl = (handler, ms) => {
    const id = nextIntervalId;
    nextIntervalId += 1;
    intervals.set(id, { handler, ms });
    return id;
  };

  const clearIntervalImpl = (id) => {
    intervals.delete(id);
  };

  const setTimeoutImpl = (handler, ms = 0) => {
    currentTime += ms;
    handler();
    const id = nextTimeoutId;
    nextTimeoutId += 1;
    return id;
  };

  const context = {
    Date: class FakeDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [currentTime]));
      }

      static now() {
        return currentTime;
      }
    },
    Element: TestElement,
    Event: TestEvent,
    GM_deleteValue(key) {
      gmState.delete(key);
    },
    GM_getValue(key, fallback) {
      return gmState.has(key) ? gmState.get(key) : fallback;
    },
    GM_setValue(key, value) {
      gmState.set(key, value);
    },
    HTMLInputElement: TestInputElement,
    MutationObserver: class TestMutationObserver {
      constructor(callback) {
        this.callback = callback;
      }

      disconnect() {
        mutationObservers.delete(this);
      }

      observe() {
        mutationObservers.add(this);
      }
    },
    Promise,
    Request: class TestRequest {
      constructor(input, init = {}) {
        const source = typeof input === 'string' ? { url: input, method: 'GET' } : input;
        this.method = init.method || source.method || 'GET';
        this.url = String(init.url || source.url || input);
      }
    },
    URL,
    URLSearchParams,
    clearInterval: clearIntervalImpl,
    clearTimeout() {},
    console,
    document,
    fetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url;
      const method = init.method || input?.method || 'GET';
      fetchCalls.push({ method, url: String(url) });
      return Promise.resolve({ method, url: String(url) });
    },
    localStorage: {
      getItem(key) {
        return localStorageState.has(key) ? localStorageState.get(key) : null;
      },
      removeItem(key) {
        localStorageState.delete(key);
      },
      setItem(key, value) {
        localStorageState.set(key, String(value));
      },
    },
    location,
    setInterval: setIntervalImpl,
    setTimeout: setTimeoutImpl,
    window: null,
  };

  context.window = {
    Event: TestEvent,
    HTMLInputElement: TestInputElement,
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    clearInterval: clearIntervalImpl,
    clearTimeout() {},
    document,
    fetch: context.fetch,
    getComputedStyle() {
      return {
        backgroundColor: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        color: '#111827',
        columnGap: '0',
        font: '14px sans-serif',
        gap: '0',
        height: '32px',
        padding: '0 12px',
      };
    },
    location,
    matchMedia() {
      return {
        addEventListener() {},
        addListener() {},
        matches: false,
      };
    },
    setInterval: setIntervalImpl,
    setTimeout: setTimeoutImpl,
  };

  context.globalThis = context;

  function dispatchDocumentEvent(type, event = {}) {
    for (const handler of documentListeners.get(type) || []) {
      handler({
        stopPropagation() {},
        type,
        ...event,
      });
    }
  }

  function createDatePicker({
    activePresetLabel = null,
    allowInputInteraction = true,
    allowPresetInteraction = true,
    inputValues = ['', ''],
    presetLabels = [],
    triggerText = '',
  } = {}) {
    const root = document.createElement('div');
    const trigger = document.createElement('button');
    const state = {
      activePresetLabel,
      applyButton: null,
      inputs: [],
      panel: null,
      presetButtons: new Map(),
      resetButton: null,
      startValue: inputValues[0] || '',
      endValue: inputValues[1] || '',
      triggerText,
    };

    trigger.className = 'date-picker-trigger';
    trigger.textContent = triggerText;
    root.appendChild(trigger);
    body.appendChild(root);

    const syncPresetButtons = () => {
      for (const [label, button] of state.presetButtons.entries()) {
        button.className =
          label === state.activePresetLabel ? 'date-picker-preset date-picker-preset-active' : 'date-picker-preset';
      }
    };

    const closePanel = () => {
      state.panel?.remove();
      state.panel = null;
      state.applyButton = null;
      state.inputs = [];
      state.presetButtons = new Map();
      state.resetButton = null;
    };

    const openPanel = () => {
      if (state.panel?.isConnected) {
        return;
      }

      const panel = document.createElement('div');
      const startInput = document.createElement('input');
      const endInput = document.createElement('input');
      const applyButton = document.createElement('button');
      const resetButton = document.createElement('button');

      panel.className = 'date-picker-panel';

      const handleCustomChange = () => {
        if (!allowInputInteraction) {
          return;
        }
        state.activePresetLabel = null;
        state.startValue = startInput.value;
        state.endValue = endInput.value;
        syncPresetButtons();
      };

      startInput.className = 'date-picker-input';
      startInput.value = state.startValue;
      startInput.addEventListener('input', handleCustomChange);
      startInput.addEventListener('change', handleCustomChange);

      endInput.className = 'date-picker-input';
      endInput.value = state.endValue;
      endInput.addEventListener('input', handleCustomChange);
      endInput.addEventListener('change', handleCustomChange);

      for (const label of presetLabels) {
        const presetButton = document.createElement('button');
        presetButton.textContent = label;
        presetButton.className = 'date-picker-preset';
        presetButton.addEventListener('click', () => {
          if (!allowPresetInteraction) {
            return;
          }
          state.activePresetLabel = label;
          state.startValue = '';
          state.endValue = '';
          startInput.value = '';
          endInput.value = '';
          syncPresetButtons();
        });
        state.presetButtons.set(label, presetButton);
        panel.appendChild(presetButton);
      }

      applyButton.className = 'date-picker-apply';
      applyButton.textContent = '应用';
      applyButton.addEventListener('click', () => {
        state.startValue = startInput.value;
        state.endValue = endInput.value;
        if (state.activePresetLabel) {
          trigger.textContent = state.activePresetLabel;
        } else if (state.startValue && state.endValue) {
          trigger.textContent = buildCustomDisplayText(state.startValue, state.endValue);
        }
        closePanel();
      });

      resetButton.textContent = '重置';
      resetButton.addEventListener('click', () => {
        state.activePresetLabel = null;
        state.startValue = '';
        state.endValue = '';
        trigger.textContent = state.triggerText;
        closePanel();
      });

      panel.appendChild(startInput);
      panel.appendChild(endInput);
      panel.appendChild(applyButton);
      panel.appendChild(resetButton);
      body.appendChild(panel);

      state.panel = panel;
      state.applyButton = applyButton;
      state.inputs = [startInput, endInput];
      state.resetButton = resetButton;
      syncPresetButtons();
    };

    trigger.addEventListener('click', openPanel);

    return {
      closePanel,
      getApplyButton() {
        return state.applyButton;
      },
      getInputs() {
        return state.inputs;
      },
      getResetButton() {
        return state.resetButton;
      },
      open() {
        trigger.click();
      },
      setCustomRange(start, end) {
        openPanel();
        const [startInput, endInput] = state.inputs;
        startInput.value = start;
        endInput.value = end;
        startInput.dispatchEvent(new TestEvent('input', { bubbles: true }));
        endInput.dispatchEvent(new TestEvent('input', { bubbles: true }));
      },
      findPreset(label) {
        return state.presetButtons.get(label) || null;
      },
      remove() {
        closePanel();
        root.remove();
      },
      root,
      trigger,
    };
  }

  function createSelectControl({ labelText, options = [], value = '' } = {}) {
    const root = document.createElement('div');
    const label = document.createElement('span');
    const button = document.createElement('button');
    const state = {
      menu: null,
    };

    label.textContent = labelText;
    button.className = 'select-trigger';
    button.textContent = value;
    button.setAttribute('aria-expanded', 'false');

    const closeMenu = () => {
      state.menu?.remove();
      state.menu = null;
      button.setAttribute('aria-expanded', 'false');
    };

    button.addEventListener('click', () => {
      if (state.menu?.isConnected) {
        closeMenu();
        return;
      }

      const menu = document.createElement('div');
      for (const optionValue of options) {
        const option = document.createElement('div');
        option.textContent = optionValue;
        option.setAttribute('role', 'option');
        option.addEventListener('click', () => {
          button.textContent = optionValue;
          closeMenu();
        });
        menu.appendChild(option);
      }

      state.menu = menu;
      body.appendChild(menu);
      button.setAttribute('aria-expanded', 'true');
    });

    root.appendChild(label);
    root.appendChild(button);
    body.appendChild(root);

    return {
      button,
      findOption(valueToFind) {
        return body
          .querySelectorAll('[role="option"]')
          .find((option) => option.textContent.trim() === valueToFind) || null;
      },
      label,
    };
  }

  return {
    createDatePicker,
    createSelectControl,
    document,
    findAutoRefreshButton() {
      return body.querySelector('[data-sub2api-auto-refresh-button="true"]');
    },
    getFetchCalls() {
      return [...fetchCalls];
    },
    getIntervalDurations() {
      return getIntervalDurations(intervals);
    },
    getStoredValue(key) {
      return gmState.get(key);
    },
    intervals,
    refreshButton,
    runMutationObservers() {
      for (const observer of mutationObservers) {
        observer.callback([]);
      }
    },
    runForegroundWatcherTick() {
      for (const { handler } of intervals.values()) {
        if (handler.name === 'checkAutoRefreshForegroundState') {
          handler();
        }
      }
    },
    sendDocumentClick(target) {
      dispatchDocumentEvent('click', { target });
    },
    sendDocumentEvent(type) {
      dispatchDocumentEvent(type);
    },
    sendWindowEvent(type) {
      for (const handler of windowListeners.get(type) || []) {
        handler({ type });
      }
    },
    setLocation(pathnameValue) {
      location.pathname = pathnameValue;
      location.href = `${origin}${pathnameValue}`;
    },
    setFocused(value) {
      focused = Boolean(value);
    },
    vmContext: vm.createContext(context),
  };
}

function getScopedStorageKey(origin, name) {
  return `sub2api-helper:${origin}:${name}`;
}

function createUsageFingerprint(environment) {
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });
  return { datePicker, pageSize };
}

test('metadata targets generic Sub2API deployments instead of one Ciii domain', () => {
  assert.match(source, /\/\/ @name\s+Sub2API Helper/);
  assert.match(source, /\/\/ @namespace\s+https:\/\/github\.com\/Wei-Shaw\/sub2api/);
  assert.match(source, /\/\/ @match\s+\*:\/\/\*\/\*/);
  assert.doesNotMatch(source, /\/\/ @match\s+https:\/\/codex\.ciii\.club\/\*/);
});

test('does not activate on a generic usage path without Sub2API UI fingerprint', async () => {
  const environment = createTestEnvironment({
    origin: 'https://docs.example.test',
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(environment.findAutoRefreshButton(), null);
  assert.deepEqual(environment.getIntervalDurations(), []);
});

test('returning to foreground refreshes once before restarting countdown', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);

  environment.document.visibilityState = 'hidden';
  environment.sendDocumentEvent('visibilitychange');
  await flushMicrotasks();

  assert.deepEqual(environment.getIntervalDurations(), [1000]);

  environment.refreshButton.disabled = true;
  environment.document.visibilityState = 'visible';
  environment.sendDocumentEvent('visibilitychange');
  await flushMicrotasks();

  assert.equal(environment.refreshButton.clickCount, 0);
  assert.deepEqual(environment.getIntervalDurations(), [1000]);

  environment.refreshButton.disabled = false;
  environment.runForegroundWatcherTick();
  await flushMicrotasks();

  assert.equal(environment.refreshButton.clickCount, 1);
  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);
  assert.equal(environment.findAutoRefreshButton()?.dataset.sub2apiAutoRefreshState, 'running');
});

test('blur before visibilitychange does not trigger a foreground refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);

  environment.setFocused(false);
  environment.sendWindowEvent('blur');
  await flushMicrotasks();

  assert.deepEqual(environment.getIntervalDurations(), [1000]);

  environment.runForegroundWatcherTick();
  await flushMicrotasks();

  assert.equal(environment.refreshButton.clickCount, 0);
  assert.deepEqual(environment.getIntervalDurations(), [1000]);
  assert.equal(environment.findAutoRefreshButton()?.dataset.sub2apiAutoRefreshState, 'paused-hidden');
});

test('visible without focus does not resume auto refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  environment.setFocused(false);
  environment.sendWindowEvent('blur');
  await flushMicrotasks();

  assert.deepEqual(environment.getIntervalDurations(), [1000]);

  environment.sendDocumentEvent('visibilitychange');
  await flushMicrotasks();

  assert.equal(environment.refreshButton.clickCount, 0);
  assert.deepEqual(environment.getIntervalDurations(), [1000]);
  assert.equal(environment.findAutoRefreshButton()?.dataset.sub2apiAutoRefreshState, 'paused-hidden');
});

test('usage re-applies saved date range after SPA tab switch when the first trigger is stale', async () => {
  const origin = 'https://codex.ciii.club';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '近 30 天' },
    },
    origin,
    pathname: '/api-keys',
  });
  const stalePicker = environment.createDatePicker({
    activePresetLabel: '近 30 天',
    presetLabels: ['近 7 天', '近 30 天'],
    triggerText: '近 30 天',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  environment.setLocation('/usage');
  environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  stalePicker.remove();
  const currentPicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(currentPicker.trigger.textContent, '近 30 天');
});

test('usage rewrites requests and syncs preset label even when the picker ignores synthetic clicks', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    allowPresetInteraction: false,
    presetLabels: ['今天', '近 7 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&page_size=50&start_date=2026-04-17&end_date=2026-04-23&sort_by=created_at&sort_order=desc&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(datePicker.trigger.textContent, '今天');
  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-23');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('usage date range storage is isolated per Sub2API origin', async () => {
  const origin = 'https://team-b.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey('https://team-a.sub2api.example.test', 'usage-date-range')]: {
        type: 'preset',
        label: '今天',
      },
      [getScopedStorageKey(origin, 'usage-date-range')]: {
        type: 'preset',
        label: '近 30 天',
      },
    },
    origin,
    pathname: '/usage',
  });
  const { datePicker } = createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
});

test('non-Ciii Sub2API deployments ignore legacy Ciii storage keys', async () => {
  const origin = 'https://team-c.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      'ciii-codex-usage-date-range': {
        type: 'preset',
        label: '今天',
      },
    },
    origin,
    pathname: '/usage',
  });
  const { datePicker } = createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 7 天');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-date-range')), undefined);
});

test('usage request rewriting does not touch cross-origin usage-like APIs', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    'https://api.other.example.test/api/v1/usage?page=1&start_date=2026-04-17&end_date=2026-04-23&timezone=Asia%2FShanghai',
  );
  const requestUrl = new URL(response.url);

  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-17');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('dashboard rewrites requests and syncs preset label even when the picker ignores synthetic clicks', async () => {
  const origin = 'https://dashboard.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'dashboard-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/dashboard',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    allowPresetInteraction: false,
    presetLabels: ['今天', '近 7 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage/dashboard/trend?start_date=2026-04-17&end_date=2026-04-23&granularity=day&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(datePicker.trigger.textContent, '今天');
  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-23');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('dashboard restores saved date range and granularity on load', async () => {
  const origin = 'https://dashboard.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'dashboard-date-range')]: { type: 'preset', label: '近 30 天' },
      [getScopedStorageKey(origin, 'dashboard-granularity')]: '按小时',
    },
    origin,
    pathname: '/dashboard',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
  assert.equal(granularity.button.textContent, '按小时');
});

test('dashboard stores selected custom date range and granularity', async () => {
  const origin = 'https://dashboard.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/dashboard' });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });

  vm.runInContext(source, environment.vmContext, { filename: scriptPath.pathname });
  await flushMicrotasks();

  datePicker.setCustomRange('2026-04-01', '2026-04-23');
  environment.sendDocumentClick(datePicker.getApplyButton());
  datePicker.getApplyButton().click();

  environment.sendDocumentClick(granularity.button);
  granularity.button.click();
  const hourlyOption = granularity.findOption('按小时');
  environment.sendDocumentClick(hourlyOption);
  hourlyOption.click();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, 'dashboard-date-range')))), {
    displayText: buildCustomDisplayText('2026-04-01', '2026-04-23'),
    end: '2026-04-23',
    start: '2026-04-01',
    type: 'custom',
  });
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'dashboard-granularity')), '按小时');
});
