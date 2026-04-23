import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const scriptPath = new URL('./ciii-codex-usage-enhancer.user.js', import.meta.url);
const source = await readFile(scriptPath, 'utf8');
const RealDate = Date;

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
    return normalizedSelector
      .split(',')
      .some((part) => matchesSelector(element, part));
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
      element.className.split(/\s+/).includes(tagAndClassSelector.className)
    );
  }

  if (normalizedSelector.startsWith('.')) {
    return element.className.split(/\s+/).includes(normalizedSelector.slice(1));
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
    this.parentElement = null;
    this.style = {};
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
    this.children.push(child);
    return child;
  }

  click() {
    const handlers = this.listeners.get('click') || [];
    for (const handler of handlers) {
      handler({
        stopPropagation() {},
        target: this,
      });
    }
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

  insertAdjacentElement(position, element) {
    if (position !== 'afterend' || !this.parentElement) {
      return null;
    }
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    element.parentElement = this.parentElement;
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

function createTestEnvironment({ savedAutoRefreshValue = 'off' } = {}) {
  let currentTime = 0;
  let focused = true;
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  const documentListeners = new Map();
  const intervals = new Map();
  const localStorageState = new Map();
  const windowListeners = new Map();

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

  const document = {
    addEventListener(type, handler) {
      const handlers = documentListeners.get(type) || [];
      handlers.push(handler);
      documentListeners.set(type, handlers);
    },
    body,
    createElement(tagName) {
      return new TestElement(tagName);
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
    GM_deleteValue() {},
    GM_getValue(key, fallback) {
      if (key === 'ciii-codex-auto-refresh-ms') {
        return savedAutoRefreshValue;
      }
      return fallback;
    },
    GM_setValue() {},
    MutationObserver: class TestMutationObserver {
      constructor(callback) {
        this.callback = callback;
      }

      disconnect() {}

      observe() {}
    },
    Promise,
    clearInterval: clearIntervalImpl,
    clearTimeout() {},
    console,
    document,
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
    location: {
      href: 'https://codex.ciii.club/usage',
      pathname: '/usage',
    },
    setInterval: setIntervalImpl,
    setTimeout: setTimeoutImpl,
    window: null,
  };

  context.window = {
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    clearInterval: clearIntervalImpl,
    clearTimeout() {},
    document,
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
    location: context.location,
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

  return {
    document,
    findAutoRefreshButton() {
      return body.querySelector('[data-ciii-auto-refresh-button="true"]');
    },
    getIntervalDurations() {
      return getIntervalDurations(intervals);
    },
    intervals,
    refreshButton,
    runForegroundWatcherTick() {
      for (const { handler } of intervals.values()) {
        if (handler.name === 'checkAutoRefreshForegroundState') {
          handler();
        }
      }
    },
    sendDocumentEvent(type) {
      for (const handler of documentListeners.get(type) || []) {
        handler({ type });
      }
    },
    sendWindowEvent(type) {
      for (const handler of windowListeners.get(type) || []) {
        handler({ type });
      }
    },
    setFocused(value) {
      focused = Boolean(value);
    },
    vmContext: vm.createContext(context),
  };
}

test('returning to foreground refreshes once before restarting countdown', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });

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
  assert.equal(environment.findAutoRefreshButton()?.dataset.ciiiAutoRefreshState, 'running');
});

test('blur before visibilitychange does not trigger a foreground refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });

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
  assert.equal(environment.findAutoRefreshButton()?.dataset.ciiiAutoRefreshState, 'paused-hidden');
});

test('visible without focus does not resume auto refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });

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
  assert.equal(environment.findAutoRefreshButton()?.dataset.ciiiAutoRefreshState, 'paused-hidden');
});
