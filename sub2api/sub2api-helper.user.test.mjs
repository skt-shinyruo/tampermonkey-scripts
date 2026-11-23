import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const buildScriptPath = new URL('./build-userscript.mjs', import.meta.url);
const builtScriptPath = join(tmpdir(), `sub2api-helper-test-${process.pid}-${Date.now()}.user.js`);
execFileSync(process.execPath, [buildScriptPath.pathname, `--output=${builtScriptPath}`], {
  encoding: 'utf8',
  stdio: 'pipe',
});
const source = await readFile(builtScriptPath, 'utf8');
const RealDate = Date;

function splitClassNames(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function createTestStyleDeclaration() {
  return {
    getPropertyValue(name) {
      return this[name] || '';
    },
    removeProperty(name) {
      const previousValue = this[name] || '';
      delete this[name];
      return previousValue;
    },
    setProperty(name, value) {
      this[name] = String(value);
    },
  };
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
  const match = selector.match(/^([a-z]+)?\[([^=]+)="([^"]+)"\]$/i);
  if (!match) {
    return null;
  }
  return {
    attribute: match[2],
    tagName: match[1]?.toUpperCase() || null,
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
      (!attributeSelector.tagName || element.tagName === attributeSelector.tagName) &&
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
    this.style = createTestStyleDeclaration();
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

  insertBefore(child, reference) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    const referenceIndex = reference ? this.children.indexOf(reference) : -1;
    const insertIndex = referenceIndex >= 0 ? referenceIndex : this.children.length;
    this.children.splice(insertIndex, 0, child);
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
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
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

  getBoundingClientRect() {
    const width = Number(this.attributes['data-test-width'] || 0);
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const camelKey = name.slice(5).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      this.dataset[camelKey] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      const camelKey = name.slice(5).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      delete this.dataset[camelKey];
    }
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
  appConfig = {
    backend_mode_enabled: false,
    custom_menu_items: [],
    site_name: 'Sub2API',
    table_default_page_size: 20,
    table_page_size_options: [10, 20, 50, 100],
    version: '0.1.125',
  },
  gmValues = {},
  now = 0,
  origin = 'https://sub2api.example.test',
  pathname = '/usage',
  preferredColorScheme = 'light',
  savedAutoRefreshValue = 'off',
  viewportWidth = 1280,
} = {}) {
  let colorScheme = preferredColorScheme;
  let currentTime = now;
  let focused = true;
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  const documentListeners = new Map();
  const gmState = new Map(Object.entries(gmValues));
  const intervals = new Map();
  const localStorageState = new Map();
  const mutationObservers = new Set();
  const timeouts = new Map();
  const fetchCalls = [];
  const fetchResponses = new Map();
  const fetchStatuses = new Map();
  const mediaQueryListeners = new Set();
  const menuCommands = new Map();
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
    reload() {
      location.reloadCount = (location.reloadCount || 0) + 1;
    },
    reloadCount: 0,
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
  html.clientWidth = viewportWidth;
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
    const id = nextTimeoutId;
    nextTimeoutId += 1;
    timeouts.set(id, true);
    currentTime += ms;
    Promise.resolve().then(() => {
      if (!timeouts.has(id)) {
        return;
      }
      timeouts.delete(id);
      handler();
    });
    return id;
  };

  const clearTimeoutImpl = (id) => {
    timeouts.delete(id);
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
    GM_registerMenuCommand(label, handler) {
      menuCommands.set(label, handler);
      return label;
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
    clearTimeout: clearTimeoutImpl,
    console,
    document,
    fetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url;
      const method = init.method || input?.method || 'GET';
      const urlText = String(url);
      fetchCalls.push({ headers: { ...(init.headers || {}) }, method, url: urlText });
      const requestPath = new URL(urlText, origin).pathname;
      const responseBody = fetchResponses.get(urlText) || fetchResponses.get(requestPath);
      const statusOverride = fetchStatuses.get(requestPath);
      const response = {
        method,
        ok: statusOverride ? statusOverride < 400 : true,
        status: statusOverride || 200,
        url: urlText,
        clone() {
          return this;
        },
        json() {
          return Promise.resolve(responseBody ?? {});
        },
      };
      return Promise.resolve(response);
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

  if (appConfig) {
    context.__APP_CONFIG__ = appConfig;
  }

  context.window = {
    Event: TestEvent,
    HTMLInputElement: TestInputElement,
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    clearInterval: clearIntervalImpl,
    clearTimeout: clearTimeoutImpl,
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
    innerWidth: viewportWidth,
    matchMedia(query) {
      return {
        addEventListener(type, handler) {
          if (type === 'change') {
            mediaQueryListeners.add(handler);
          }
        },
        addListener(handler) {
          mediaQueryListeners.add(handler);
        },
        get matches() {
          if (String(query).includes('dark')) {
            return colorScheme === 'dark';
          }
          if (String(query).includes('light')) {
            return colorScheme === 'light';
          }
          return false;
        },
        media: String(query),
      };
    },
    setInterval: setIntervalImpl,
    setTimeout: setTimeoutImpl,
  };
  if (appConfig) {
    context.window.__APP_CONFIG__ = appConfig;
  }

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
    bubbleProgrammaticClicks = false,
    deferApplyTriggerUpdate = false,
    ignoredTriggerClicks = 0,
    inputValues = ['', ''],
    ignoredApplyUpdates = 0,
    presetClickAppliesImmediately = false,
    presetLabels = [],
    triggerText = '',
  } = {}) {
    const root = document.createElement('div');
    const trigger = document.createElement('button');
    const state = {
      activePresetLabel,
      applyButton: null,
      applyClickCount: 0,
      ignoredApplyUpdates,
      ignoredTriggerClicks,
      inputs: [],
      panel: null,
      presetClickCounts: new Map(),
      presetButtons: new Map(),
      resetButton: null,
      startValue: inputValues[0] || '',
      endValue: inputValues[1] || '',
      triggerClickCount: 0,
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

    const bubbleProgrammaticClick = (target) => {
      if (bubbleProgrammaticClicks) {
        dispatchDocumentEvent('click', { isTrusted: false, target });
      }
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
        state.presetClickCounts.set(label, 0);
        presetButton.addEventListener('click', () => {
          bubbleProgrammaticClick(presetButton);
          state.presetClickCounts.set(label, (state.presetClickCounts.get(label) || 0) + 1);
          if (!allowPresetInteraction) {
            return;
          }
          state.activePresetLabel = label;
          state.startValue = '';
          state.endValue = '';
          startInput.value = '';
          endInput.value = '';
          syncPresetButtons();
          if (presetClickAppliesImmediately) {
            trigger.textContent = label;
            closePanel();
          }
        });
        state.presetButtons.set(label, presetButton);
        panel.appendChild(presetButton);
      }

      applyButton.className = 'date-picker-apply';
      applyButton.textContent = '应用';
      applyButton.addEventListener('click', () => {
        bubbleProgrammaticClick(applyButton);
        state.applyClickCount += 1;
        state.startValue = startInput.value;
        state.endValue = endInput.value;
        const updateTriggerText = () => {
          if (state.ignoredApplyUpdates > 0) {
            state.ignoredApplyUpdates -= 1;
            return;
          }
          if (state.activePresetLabel) {
            trigger.textContent = state.activePresetLabel;
          } else if (state.startValue && state.endValue) {
            trigger.textContent = buildCustomDisplayText(state.startValue, state.endValue);
          }
        };
        if (state.activePresetLabel) {
          if (deferApplyTriggerUpdate) {
            setTimeoutImpl(updateTriggerText, 50);
          } else {
            updateTriggerText();
          }
        } else if (state.startValue && state.endValue) {
          if (deferApplyTriggerUpdate) {
            setTimeoutImpl(updateTriggerText, 50);
          } else {
            updateTriggerText();
          }
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

    trigger.addEventListener('click', () => {
      bubbleProgrammaticClick(trigger);
      state.triggerClickCount += 1;
      if (state.ignoredTriggerClicks > 0) {
        state.ignoredTriggerClicks -= 1;
        return;
      }
      openPanel();
    });

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
      getClickCounts() {
        return {
          apply: state.applyClickCount,
          presets: new Map(state.presetClickCounts),
          trigger: state.triggerClickCount,
        };
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
    createSidebarActionButton({
      collapsed = false,
      text = '渠道管理',
      title = text,
    } = {}) {
      const button = document.createElement('button');
      button.className = collapsed ? 'sidebar-link mb-1 w-full sidebar-link-collapsed' : 'sidebar-link mb-1 w-full';
      button.setAttribute('title', title);
      button.textContent = text;
      body.appendChild(button);
      return button;
    },
    createSidebarToggle({ collapsed = false, keepsTextAfterCollapse = false } = {}) {
      const button = document.createElement('button');
      const syncState = (nextCollapsed) => {
        button.className = nextCollapsed ? 'sidebar-link w-full sidebar-link-collapsed' : 'sidebar-link w-full';
        button.setAttribute('title', nextCollapsed ? '展开' : '收起');
        button.textContent = keepsTextAfterCollapse ? '收起' : nextCollapsed ? '展开' : '收起';
      };
      button.clickCount = 0;
      button._sidebarStateUpdateDelayMs = 0;
      button.addEventListener('click', () => {
        button.clickCount += 1;
        const nextCollapsed = button.getAttribute('title') !== '展开';
        const delayMs = Number(button._sidebarStateUpdateDelayMs) || 0;
        if (delayMs > 0) {
          setTimeoutImpl(() => syncState(nextCollapsed), delayMs);
          return;
        }
        syncState(nextCollapsed);
      });
      syncState(collapsed);
      body.appendChild(button);
      return button;
    },
    createSidebar({ collapsed = false, nativeWidth = '' } = {}) {
      const sidebar = document.createElement('aside');
      sidebar.className = 'sidebar';
      if (nativeWidth) {
        sidebar.style.width = nativeWidth;
      }

      const nav = document.createElement('nav');
      nav.className = 'sidebar-nav';
      const link = document.createElement('a');
      link.className = 'sidebar-link';
      link.setAttribute('href', '/usage');
      link.textContent = '使用记录';
      nav.appendChild(link);

      const toggle = document.createElement('button');
      const syncState = (nextCollapsed) => {
        toggle.className = nextCollapsed ? 'sidebar-link w-full sidebar-link-collapsed' : 'sidebar-link w-full';
        toggle.setAttribute('title', nextCollapsed ? '展开' : '收起');
        toggle.textContent = nextCollapsed ? '展开' : '收起';
      };
      toggle.clickCount = 0;
      toggle._sidebarStateUpdateDelayMs = 0;
      toggle.addEventListener('click', () => {
        toggle.clickCount += 1;
        const nextCollapsed = toggle.getAttribute('title') !== '展开';
        const delayMs = Number(toggle._sidebarStateUpdateDelayMs) || 0;
        if (delayMs > 0) {
          setTimeoutImpl(() => syncState(nextCollapsed), delayMs);
          return;
        }
        syncState(nextCollapsed);
      });
      syncState(collapsed);

      sidebar.appendChild(nav);
      sidebar.appendChild(toggle);
      body.appendChild(sidebar);
      return { sidebar, toggle };
    },
    createAppLayout({ collapsed = false, nativeWidth = '', withMobileOverlay = false } = {}) {
      const { sidebar, toggle } = this.createSidebar({ collapsed, nativeWidth });
      if (withMobileOverlay) {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-30 bg-black/50 lg:hidden';
        body.appendChild(overlay);
      }

      const content = document.createElement('div');
      const header = document.createElement('header');
      const main = document.createElement('main');
      content.className = 'relative min-h-screen transition-all duration-300 lg:ml-64';
      header.className = 'glass sticky top-0 z-30 border-b';
      main.className = 'p-4 md:p-6 lg:p-8';
      main.textContent = 'Main content';
      content.appendChild(header);
      content.appendChild(main);
      body.appendChild(content);
      return { content, header, main, sidebar, toggle };
    },
    createThemeToggle({ dark = false, localStorageTheme = dark ? 'dark' : 'light' } = {}) {
      const button = document.createElement('button');
      const syncTheme = (nextDark, storageTheme = nextDark ? 'dark' : 'light') => {
        if (nextDark) {
          html.classList.add('dark');
        } else {
          html.classList.remove('dark');
        }
        button.textContent = nextDark ? '浅色模式' : '深色模式';
        context.localStorage.setItem('theme', storageTheme);
      };

      button.clickCount = 0;
      button.addEventListener('click', () => {
        button.clickCount += 1;
        syncTheme(!html.classList.contains('dark'));
      });
      syncTheme(dark, localStorageTheme);
      body.appendChild(button);
      return button;
    },
    document,
    findAutoRefreshButton() {
      return body.querySelector('[data-sub2api-auto-refresh-button="true"]');
    },
    findSettingsRoot() {
      return body.querySelector('[data-sub2api-settings-root="true"]');
    },
    findSettingsLauncherButton() {
      return body.querySelector('[data-sub2api-settings-launcher="true"]');
    },
    getFetchCalls() {
      return [...fetchCalls];
    },
    setFetchResponse(pathOrUrl, responseBody) {
      fetchResponses.set(pathOrUrl, responseBody);
    },
    setFetchStatus(pathOrUrl, status) {
      fetchStatuses.set(pathOrUrl, status);
    },
    setVisibilityState(value) {
      document.visibilityState = value;
      dispatchDocumentEvent('visibilitychange');
    },
    getMenuCommand(label) {
      return menuCommands.get(label) || null;
    },
    getIntervalDurations() {
      return getIntervalDurations(intervals);
    },
    getCreatedIntervalCount() {
      return nextIntervalId - 1;
    },
    getStoredValue(key) {
      return gmState.get(key);
    },
    getLocalStorageValue(key) {
      return context.localStorage.getItem(key);
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
    setViewportWidth(value) {
      const width = Number(value);
      context.window.innerWidth = width;
      html.clientWidth = width;
    },
    setPreferredColorScheme(value) {
      colorScheme = value === 'dark' ? 'dark' : 'light';
      for (const handler of mediaQueryListeners) {
        handler({
          matches: colorScheme === 'dark',
          media: '(prefers-color-scheme: dark)',
        });
      }
    },
    setLocation(pathnameValue) {
      location.pathname = pathnameValue;
      location.href = `${origin}${pathnameValue}`;
    },
    setFocused(value) {
      focused = Boolean(value);
    },
    location,
    vmContext: vm.createContext(context),
  };
}

function getScopedStorageKey(origin, name) {
  return `sub2api-helper:${origin}:${name}`;
}

function getGlobalFeatureStorageKey(featureId) {
  return `sub2api-helper:global:feature:${featureId}:enabled`;
}

function getGlobalSettingsStorageKey(name) {
  return `sub2api-helper:global:${name}`;
}

function getPageFeatureStorageKey(origin, pathname, featureId) {
  return `sub2api-helper:${origin}:${pathname}:feature:${featureId}:enabled`;
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

function createUsageTokenSummary(environment, {
  input = '63.76M',
  cache = '924.98M',
  cacheCreation,
  cacheRead,
} = {}) {
  const line = environment.document.createElement('p');
  const inputLabel = environment.document.createElement('span');
  const firstSeparator = environment.document.createElement('span');
  const outputLabel = environment.document.createElement('span');
  const secondSeparator = environment.document.createElement('span');
  const cacheRoot = environment.document.createElement('span');
  const cacheLabel = environment.document.createElement('span');

  inputLabel.textContent = `输入: ${input}`;
  firstSeparator.textContent = '/';
  outputLabel.textContent = '输出: 3.64M';
  secondSeparator.textContent = '/';
  cacheLabel.textContent = `缓存: ${cache}`;
  cacheRoot.appendChild(cacheLabel);

  if (cacheCreation !== undefined || cacheRead !== undefined) {
    const tooltip = environment.document.createElement('span');
    const title = environment.document.createElement('span');
    title.textContent = '缓存 Token 明细';
    tooltip.appendChild(title);
    for (const [label, value] of [
      ['缓存创建', cacheCreation ?? '0'],
      ['缓存读取', cacheRead ?? cache],
    ]) {
      const detail = environment.document.createElement('div');
      const detailLabel = environment.document.createElement('span');
      const detailValue = environment.document.createElement('span');
      detailLabel.textContent = label;
      detailValue.textContent = value;
      detail.appendChild(detailLabel);
      detail.appendChild(detailValue);
      tooltip.appendChild(detail);
    }
    cacheRoot.appendChild(tooltip);
  }

  line.appendChild(inputLabel);
  line.appendChild(firstSeparator);
  line.appendChild(outputLabel);
  line.appendChild(secondSeparator);
  line.appendChild(cacheRoot);
  environment.document.body.appendChild(line);

  return { cacheRoot, line };
}

function createUsageCostSummary(environment, {
  accountCost = '$13.7392',
  includeAccountCost = true,
  language = 'zh',
  standardCost = '$187.5804',
  total = '$21.5680',
} = {}) {
  const document = environment.document;
  const card = document.createElement('div');
  const label = document.createElement('p');
  const totalAmount = document.createElement('p');
  const line = document.createElement('p');
  const isChinese = language !== 'en';

  label.textContent = isChinese ? '总消费' : 'Total Cost';
  totalAmount.textContent = total;
  card.appendChild(label);
  card.appendChild(totalAmount);

  let accountCostElement = null;
  if (includeAccountCost) {
    accountCostElement = document.createElement('span');
    const separator = document.createElement('span');
    accountCostElement.className = 'text-orange-500';
    accountCostElement.textContent = `${isChinese ? '成本' : 'Cost'} ${accountCost}`;
    separator.textContent = ' · ';
    line.appendChild(accountCostElement);
    line.appendChild(separator);
  }

  const standard = document.createElement('span');
  const standardLabel = document.createElement('span');
  const standardAmount = document.createElement('span');
  standardLabel.textContent = isChinese ? '标准' : 'Standard';
  standardAmount.textContent = standardCost;
  standard.appendChild(standardLabel);
  standard.appendChild(standardAmount);
  line.appendChild(standard);
  card.appendChild(line);
  document.body.appendChild(card);

  return { accountCostElement, card, label, line, standard, totalAmount };
}

function createAdminAccountsFilters(environment, groupOptions = ['全部分组', '未分配分组', '订阅', 'Anthropic', 'OpenAI']) {
  return {
    platform: environment.createSelectControl({
      options: ['全部平台', 'Anthropic', 'OpenAI', 'Gemini', 'Antigravity'],
      value: '全部平台',
    }),
    type: environment.createSelectControl({
      options: ['全部类型', 'OAuth', 'Setup Token', 'API Key', 'AWS Bedrock'],
      value: '全部类型',
    }),
    status: environment.createSelectControl({
      options: ['全部状态', '正常', '停用', '错误', '限流中', '临时不可调度', '不可调度'],
      value: '全部状态',
    }),
    privacy: environment.createSelectControl({
      options: ['全部Privacy状态', '未设置', 'Privacy', 'CF', 'Fail'],
      value: '全部Privacy状态',
    }),
    group: environment.createSelectControl({
      options: groupOptions,
      value: '全部分组',
    }),
  };
}

function createUsageEnhancementTable(environment, rows, { legacyColumns = false } = {}) {
  const document = environment.document;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const tbody = document.createElement('tbody');
  const headers = legacyColumns
    ? ['模型', '类型', 'Tokens', '费用', '首 TOKEN', '耗时', 'USER-AGENT']
    : ['模型', '类型', 'Tokens', '费用', '延迟', 'USER-AGENT'];
  const columnKeys = legacyColumns
    ? ['model', 'type', 'tokens', 'cost', 'firstToken', 'duration', 'userAgent']
    : ['model', 'type', 'tokens', 'cost', 'latency', 'userAgent'];
  const rowElements = new Map();
  const latencyElements = new Map();

  const appendLatencyContent = (td, row) => {
    const wrapper = document.createElement('div');
    const latencyBar = document.createElement('span');
    const grid = document.createElement('div');
    const firstLabel = document.createElement('span');
    const firstValue = document.createElement('span');
    const totalLabel = document.createElement('span');
    const totalValue = document.createElement('span');
    const nativeDurationText = document.createElement('span');

    wrapper.className = 'flex items-stretch gap-2';
    latencyBar.className = 'w-1 shrink-0 rounded-full bg-gradient-to-b from-40% to-60% from-emerald-500 to-amber-400';
    grid.className = 'grid grid-cols-[max-content_max-content]';
    firstLabel.className = 'text-gray-400 dark:text-gray-500';
    totalLabel.className = 'text-gray-400 dark:text-gray-500';
    firstValue.className = row.firstTokenClass || 'font-medium tabular-nums text-amber-500';
    totalValue.className = row.durationClass || 'font-medium tabular-nums text-emerald-500';
    firstLabel.textContent = '首字';
    firstValue.textContent = row.firstToken ?? '-';
    totalLabel.textContent = '总耗时';
    nativeDurationText.textContent = row.duration ?? '-';
    totalValue.appendChild(nativeDurationText);
    grid.appendChild(firstLabel);
    grid.appendChild(firstValue);
    grid.appendChild(totalLabel);
    grid.appendChild(totalValue);
    wrapper.appendChild(latencyBar);
    wrapper.appendChild(grid);
    td.appendChild(wrapper);
    return { bar: latencyBar, grid, firstTokenValue: firstValue, totalLabel, totalValue };
  };

  const appendCostContent = (td, row) => {
    if (!row.costInfoIcon) {
      td.textContent = row.cost ?? '';
      return;
    }

    const wrapper = document.createElement('div');
    const mainLine = document.createElement('div');
    const amount = document.createElement('span');
    const infoRoot = document.createElement('div');
    const infoCircle = document.createElement('div');
    const accountLine = document.createElement('div');
    const accountAmount = document.createElement('span');

    mainLine.className = 'flex items-center gap-1.5';
    amount.textContent = row.cost ?? '';
    infoRoot.className = 'group relative';
    infoRoot.dataset.testCostInfoRoot = 'true';
    infoCircle.className = 'flex h-4 w-4 cursor-help rounded-full';
    infoCircle.dataset.testCostInfoCircle = 'true';
    accountLine.dataset.testCostAccountLine = 'true';
    accountAmount.textContent = row.accountCost ?? `A ${row.cost ?? ''}`;

    infoRoot.appendChild(infoCircle);
    mainLine.appendChild(amount);
    mainLine.appendChild(infoRoot);
    accountLine.appendChild(accountAmount);
    wrapper.appendChild(mainLine);
    wrapper.appendChild(accountLine);
    td.appendChild(wrapper);
  };

  const appendTokensContent = (td, row) => {
    if (!row.tokensStack) {
      td.textContent = row.tokens ?? '';
      return;
    }

    const wrapper = document.createElement('div');
    const stack = document.createElement('div');
    const ioLine = document.createElement('div');
    const inputValue = document.createElement('span');
    const outputValue = document.createElement('span');

    wrapper.className = 'flex items-center gap-1.5';
    stack.className = 'space-y-1 text-sm';
    ioLine.className = 'flex items-center gap-2';
    inputValue.textContent = String(row.inputTokens ?? 0);
    outputValue.textContent = String(row.outputTokens ?? 0);
    if (row.ioLineWidth != null) {
      ioLine.setAttribute('data-test-width', String(row.ioLineWidth));
    }
    ioLine.appendChild(inputValue);
    ioLine.appendChild(outputValue);
    stack.appendChild(ioLine);

    if ((row.cacheReadTokens ?? 0) > 0 || (row.cacheCreationTokens ?? 0) > 0) {
      const cacheLine = document.createElement('div');
      cacheLine.className = 'flex items-center gap-2';
      if (row.cacheLineWidth != null) {
        cacheLine.setAttribute('data-test-width', String(row.cacheLineWidth));
      }
      if ((row.cacheReadTokens ?? 0) > 0) {
        const cacheReadGroup = document.createElement('div');
        const cacheRead = document.createElement('span');
        cacheReadGroup.className = 'inline-flex items-center gap-1';
        cacheRead.className = 'font-medium text-sky-600 dark:text-sky-400';
        cacheRead.textContent = String(row.cacheReadTokens);
        cacheReadGroup.appendChild(cacheRead);
        cacheLine.appendChild(cacheReadGroup);
      }
      if ((row.cacheCreationTokens ?? 0) > 0) {
        const cacheCreationGroup = document.createElement('div');
        const cacheCreation = document.createElement('span');
        cacheCreationGroup.className = 'inline-flex items-center gap-1';
        cacheCreation.className = 'font-medium text-amber-600 dark:text-amber-400';
        cacheCreation.textContent = String(row.cacheCreationTokens);
        cacheCreationGroup.appendChild(cacheCreation);
        cacheLine.appendChild(cacheCreationGroup);
      }
      stack.appendChild(cacheLine);
    }

    wrapper.appendChild(stack);
    td.appendChild(wrapper);
  };

  for (const header of headers) {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-row-id', String(row.id));
    const cells = {};
    for (const columnKey of columnKeys) {
      const td = document.createElement('td');
      if (columnKey === 'cost') {
        appendCostContent(td, row);
      } else if (columnKey === 'tokens') {
        appendTokensContent(td, row);
      } else if (columnKey === 'latency') {
        latencyElements.set(String(row.id), appendLatencyContent(td, row));
      } else if (columnKey === 'userAgent') {
        td.textContent = row.userAgent ?? 'codex-tui/0.140.0 (Ubuntu 24.4.0; x86_64)';
      } else {
        td.textContent = row[columnKey] ?? '';
      }
      cells[columnKey] = td;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    rowElements.set(String(row.id), { cells, row: tr });
  }

  table.appendChild(tbody);
  document.body.appendChild(table);

  return {
    getCell(rowId, columnKey) {
      return rowElements.get(String(rowId))?.cells[columnKey] || null;
    },
    getLatencyDurationValue(rowId) {
      return latencyElements.get(String(rowId))?.totalValue || null;
    },
    getLatencyElements(rowId) {
      return latencyElements.get(String(rowId)) || null;
    },
    getFastIcons(rowId) {
      return [
        ...rowElements
          .get(String(rowId))
          ?.cells.cost.querySelectorAll('[data-sub2api-usage-fast-tier-icon="true"]') || [],
      ];
    },
    table,
  };
}

function buildUsageListResponse(items) {
  return {
    items,
    page: 1,
    page_size: items.length,
    pages: 1,
    total: items.length,
  };
}

test('build script check mode validates generated source', () => {
  const outputPath = join(tmpdir(), `sub2api-helper-check-${process.pid}-${Date.now()}.user.js`);

  execFileSync(process.execPath, [buildScriptPath.pathname, `--output=${outputPath}`], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [buildScriptPath.pathname, `--output=${outputPath}`, '--check'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

test('build script can write a Greasy Fork sync artifact for the build branch', async () => {
  const hostedScriptUrl =
    'https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/sub2api-helper.user.js';
  const outputPath = join(tmpdir(), `sub2api-helper-${Date.now()}.user.js`);

  execFileSync(process.execPath, [buildScriptPath.pathname, `--output=${outputPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUB2API_DOWNLOAD_URL: hostedScriptUrl,
      SUB2API_UPDATE_URL: hostedScriptUrl,
    },
    stdio: 'pipe',
  });

  const publishedSource = await readFile(outputPath, 'utf8');

  assert.match(publishedSource, new RegExp(`// @downloadURL\\s+${hostedScriptUrl}`));
  assert.match(publishedSource, new RegExp(`// @updateURL\\s+${hostedScriptUrl}`));
  assert.match(publishedSource, /function openSettingsPanel/);
});

test('build script applies SUB2API_VERSION to metadata and runtime version', async () => {
  const outputPath = join(tmpdir(), `sub2api-helper-version-${process.pid}-${Date.now()}.user.js`);

  execFileSync(process.execPath, [buildScriptPath.pathname, `--output=${outputPath}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUB2API_VERSION: '0.22.123',
    },
    stdio: 'pipe',
  });

  const versionedSource = await readFile(outputPath, 'utf8');

  assert.match(versionedSource, /\/\/ @version\s+0\.22\.123/);
  assert.match(versionedSource, /const SCRIPT_VERSION = '0\.22\.123';/);
});

test('restores a saved collapsed sidebar across the Sub2API management UI', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '展开');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('restores a saved expanded sidebar across the Sub2API management UI', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/dashboard',
  });
  environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });
  const sidebarToggle = environment.createSidebarToggle({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('stores sidebar collapsed state after the native toggle is clicked', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), true);
});

test('stores sidebar collapsed state when the native toggle keeps visible text after collapsing', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: false,
    keepsTextAfterCollapse: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.getAttribute('title'), '展开');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), true);
});

test('restores saved expanded sidebar when collapsed state is only exposed by title', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: true,
    keepsTextAfterCollapse: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.getAttribute('title'), '收起');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('allows expanding a previously saved collapsed sidebar before the delayed save runs', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: true,
    keepsTextAfterCollapse: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sidebarToggle.getAttribute('title'), '收起');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), false);
});

test('stores expanded sidebar state from the real toggle when other collapsed sidebar buttons exist', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const menuButton = environment.createSidebarActionButton({
    collapsed: true,
    text: '渠道管理',
  });
  const themeButton = environment.createSidebarActionButton({
    collapsed: true,
    text: '深色模式',
  });
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: true,
    keepsTextAfterCollapse: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sidebarToggle.getAttribute('title'), '收起');
  assert.equal(menuButton.getAttribute('title'), '渠道管理');
  assert.equal(themeButton.getAttribute('title'), '深色模式');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), false);
});

test('stores expanded sidebar state after the native toggle updates asynchronously', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: true,
    keepsTextAfterCollapse: true,
  });
  sidebarToggle._sidebarStateUpdateDelayMs = 300;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(sidebarToggle);
  sidebarToggle.click();
  await flushMicrotasks();

  assert.equal(sidebarToggle.getAttribute('title'), '收起');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-collapsed')), false);
});

test('restores expanded sidebar state using the real toggle when collapsed sidebar links are present', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const menuButton = environment.createSidebarActionButton({
    collapsed: true,
    text: '渠道管理',
  });
  const sidebarToggle = environment.createSidebarToggle({
    collapsed: true,
    keepsTextAfterCollapse: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.getAttribute('title'), '收起');
  assert.equal(sidebarToggle.clickCount, 1);
  assert.equal(menuButton.getAttribute('title'), '渠道管理');
});

test('restores the sidebar only once when mutation observers fire repeatedly', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });
  sidebarToggle._sidebarStateUpdateDelayMs = 300;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.clickCount, 1);

  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sidebarToggle.clickCount, 1);
});

test('sidebar collapsed storage is isolated per Sub2API origin', async () => {
  const origin = 'https://team-b.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey('https://team-a.sub2api.example.test', 'sidebar-collapsed')]: true,
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('activates sidebar persistence on Sub2API admin pages without usage or dashboard fingerprints', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
    },
    origin,
    pathname: '/admin/accounts',
  });
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '展开');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('sidebar width applies after restoring a saved expanded sidebar asynchronously', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: false,
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar, toggle } = environment.createSidebar({ collapsed: true });
  toggle._sidebarStateUpdateDelayMs = 300;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(toggle.getAttribute('title'), '收起');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
});

test('unconfigured sidebar width mode defaults to compact on expanded sidebars', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false, nativeWidth: '214px' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
});

test('default sidebar width mode leaves expanded sidebar width untouched', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'default',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false, nativeWidth: '214px' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.style.width, '214px');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('compact sidebar width mode applies the compact width to expanded sidebars', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
  assert.ok(environment.document.querySelector('[data-sub2api-sidebar-width-style="true"]'));
});

test('compact sidebar width mode offsets the app content shell', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { content, sidebar } = environment.createAppLayout({ collapsed: false, withMobileOverlay: true });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const styleElement = environment.document.querySelector('[data-sub2api-sidebar-width-style="true"]');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, 'true');
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
  assert.match(styleElement.textContent, /margin-left: var\(--sub2api-helper-sidebar-width\) !important;/);
});

test('default sidebar width mode clears the app content shell offset', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'default',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { content } = environment.createAppLayout({ collapsed: false });
  content.dataset.sub2apiSidebarLayoutWidthApplied = 'true';
  content.style.setProperty('--sub2api-helper-sidebar-width', '220px');

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, undefined);
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is skipped when sidebar expanded state is unknown', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  const sidebar = environment.document.createElement('aside');
  sidebar.className = 'sidebar';
  const nav = environment.document.createElement('nav');
  nav.className = 'sidebar-nav';
  const link = environment.document.createElement('a');
  link.className = 'sidebar-link';
  link.setAttribute('href', '/usage');
  link.textContent = '使用记录';
  nav.appendChild(link);
  const unrelatedButton = environment.document.createElement('button');
  unrelatedButton.textContent = '渠道管理';
  sidebar.appendChild(nav);
  sidebar.appendChild(unrelatedButton);
  environment.document.body.appendChild(sidebar);
  const content = environment.document.createElement('div');
  const main = environment.document.createElement('main');
  content.className = 'relative min-h-screen transition-all duration-300 lg:ml-64';
  content.dataset.sub2apiSidebarLayoutWidthApplied = 'true';
  content.style.setProperty('--sub2api-helper-sidebar-width', '220px');
  content.appendChild(main);
  environment.document.body.appendChild(content);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, undefined);
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width ignores unrelated expand or collapse buttons outside the sidebar', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  const outsideButton = environment.document.createElement('button');
  outsideButton.textContent = '收起';
  environment.document.body.appendChild(outsideButton);

  const sidebar = environment.document.createElement('aside');
  sidebar.className = 'sidebar';
  const nav = environment.document.createElement('nav');
  nav.className = 'sidebar-nav';
  const link = environment.document.createElement('a');
  link.className = 'sidebar-link';
  link.setAttribute('href', '/usage');
  link.textContent = '使用记录';
  nav.appendChild(link);
  const unrelatedSidebarButton = environment.document.createElement('button');
  unrelatedSidebarButton.textContent = '渠道管理';
  sidebar.appendChild(nav);
  sidebar.appendChild(unrelatedSidebarButton);
  environment.document.body.appendChild(sidebar);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('custom sidebar width mode applies a valid custom width', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 184,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '184px');
});

test('invalid custom sidebar width does not apply an override', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 400,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('custom sidebar width mode without a saved width does not apply an override', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is skipped while the native sidebar is collapsed', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { content, sidebar } = environment.createAppLayout({ collapsed: true });
  content.dataset.sub2apiSidebarLayoutWidthApplied = 'true';
  content.style.setProperty('--sub2api-helper-sidebar-width', '220px');

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, undefined);
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is skipped below the desktop viewport breakpoint', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
    viewportWidth: 760,
  });
  createUsageFingerprint(environment);
  const { content, sidebar } = environment.createAppLayout({ collapsed: false });
  content.dataset.sub2apiSidebarLayoutWidthApplied = 'true';
  content.style.setProperty('--sub2api-helper-sidebar-width', '220px');

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, undefined);
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is removed after the native sidebar collapses', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { content, sidebar, toggle } = environment.createAppLayout({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, 'true');

  environment.sendDocumentClick(toggle);
  toggle.click();
  await flushMicrotasks();

  assert.equal(toggle.getAttribute('title'), '展开');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
  assert.equal(content.dataset.sub2apiSidebarLayoutWidthApplied, undefined);
  assert.equal(content.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
});

test('sidebar width override is applied after resizing into the desktop breakpoint', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'compact',
    },
    origin,
    pathname: '/usage',
    viewportWidth: 760,
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);

  environment.setViewportWidth(1280);
  environment.sendWindowEvent('resize');
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
});

test('admin accounts restores and stores account filter selections', async () => {
  const origin = 'https://accounts.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-filter-group')]: 'OpenAI',
      [getScopedStorageKey(origin, 'admin-accounts-filter-platform')]: 'Anthropic',
      [getScopedStorageKey(origin, 'admin-accounts-filter-privacy')]: 'Privacy',
      [getScopedStorageKey(origin, 'admin-accounts-filter-status')]: '正常',
      [getScopedStorageKey(origin, 'admin-accounts-filter-type')]: 'API Key',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(environment);
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(filters.platform.button.textContent, 'Anthropic');
  assert.equal(filters.type.button.textContent, 'API Key');
  assert.equal(filters.status.button.textContent, '正常');
  assert.equal(filters.privacy.button.textContent, 'Privacy');
  assert.equal(filters.group.button.textContent, 'OpenAI');

  environment.sendDocumentClick(filters.group.button);
  filters.group.button.click();
  const subscriptionsOption = filters.group.findOption('订阅');
  environment.sendDocumentClick(subscriptionsOption);
  subscriptionsOption.click();

  environment.sendDocumentClick(filters.privacy.button);
  filters.privacy.button.click();
  const cfOption = filters.privacy.findOption('CF');
  environment.sendDocumentClick(cfOption);
  cfOption.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-group')), '订阅');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-privacy')), 'CF');
});

test('admin accounts restores and stores its own page size', async () => {
  const origin = 'https://accounts-page-size.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-filter-group')]: 'OpenAI',
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-usage-page-size')]: '20',
      [getScopedStorageKey(origin, 'usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(environment);
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  // Leave a filter selection window open before choosing a page size.
  environment.sendDocumentClick(filters.group.button);
  filters.group.button.click();
  environment.runMutationObservers();
  await flushMicrotasks();
  assert.equal(filters.group.button.getAttribute('aria-expanded'), 'true');
  assert.equal(pageSize.button.getAttribute('aria-expanded'), 'false');

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  const pageSize50Option = pageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-group')), 'OpenAI');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-page-size')), '50');

  environment.getMenuCommand('Sub2API Helper 设置')();
  const accountsGroup = environment
    .findSettingsRoot()
    .querySelector('section[data-sub2api-settings-group="admin-accounts"]');
  assert.ok(accountsGroup);
  assert.ok(accountsGroup.querySelector('input[data-sub2api-feature-global-switch="admin-accounts-page-size"]'));
});

test('admin accounts stores a numeric group option as a filter instead of a page size', async () => {
  const origin = 'https://accounts-numeric-group.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '100',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(
    environment,
    ['全部分组', '未分配分组', '50'],
  );
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  environment.sendDocumentClick(filters.group.button);
  filters.group.button.click();
  const numericOptions = environment.document.body
    .querySelectorAll('[role="option"]')
    .filter((option) => option.textContent.trim() === '50');
  const numericGroupOption = numericOptions.at(-1);
  environment.sendDocumentClick(numericGroupOption);
  numericGroupOption.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-group')), '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '100');
});

test('admin accounts restores page size after returning from another tab', async () => {
  const origin = 'https://accounts-page-size-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '100',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const initialFilters = createAdminAccountsFilters(environment);
  const initialPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(initialPageSize.button.textContent, '100');

  initialPageSize.button.parentElement.remove();
  const sameRoutePageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sameRoutePageSize.button.textContent, '100');

  for (const filter of Object.values(initialFilters)) {
    filter.button.parentElement.remove();
  }
  sameRoutePageSize.button.parentElement.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/accounts');
  createAdminAccountsFilters(environment);
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '100');
});

test('page size selection state does not cross from admin accounts to admin usage', async () => {
  const origin = 'https://page-size-spa-isolation.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(environment);
  const accountsPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(accountsPageSize.button.textContent, '100');
  environment.sendDocumentClick(accountsPageSize.button);
  accountsPageSize.button.click();
  accountsPageSize.button.click();

  for (const filter of Object.values(filters)) {
    filter.button.parentElement.remove();
  }
  accountsPageSize.button.parentElement.remove();
  environment.setLocation('/admin/usage');
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const adminUsagePageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(adminUsagePageSize.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '100');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '50');
});

test('admin groups restores and stores its own page size', async () => {
  const origin = 'https://groups-page-size.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '20',
      [getScopedStorageKey(origin, 'admin-usage-page-size')]: '20',
      [getScopedStorageKey(origin, 'usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/groups',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  const pageSize50Option = pageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-groups-page-size')), '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-page-size')), '50');

  environment.getMenuCommand('Sub2API Helper 设置')();
  const groupsGroup = environment
    .findSettingsRoot()
    .querySelector('section[data-sub2api-settings-group="admin-groups"]');
  assert.ok(groupsGroup);
  assert.ok(groupsGroup.querySelector('input[data-sub2api-feature-global-switch="admin-groups-page-size"]'));
  assert.ok(groupsGroup.querySelector('input[data-sub2api-feature-page-switch="admin-groups-page-size"]'));
});

test('admin groups restores page size after its pagination remounts', async () => {
  const origin = 'https://groups-page-size-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '100',
    },
    origin,
    pathname: '/admin/groups',
  });
  const initialPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(initialPageSize.button.textContent, '100');

  initialPageSize.button.parentElement.remove();
  const sameRoutePageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sameRoutePageSize.button.textContent, '100');

  sameRoutePageSize.button.parentElement.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/groups');
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '100');
});

test('page size selection state does not cross from admin groups to admin accounts', async () => {
  const origin = 'https://groups-page-size-isolation.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '50',
    },
    origin,
    pathname: '/admin/groups',
  });
  const groupsPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(groupsPageSize.button.textContent, '100');
  environment.sendDocumentClick(groupsPageSize.button);
  groupsPageSize.button.click();
  groupsPageSize.button.click();

  groupsPageSize.button.parentElement.remove();
  environment.setLocation('/admin/accounts');
  createAdminAccountsFilters(environment);
  const accountsPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(accountsPageSize.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-groups-page-size')), '100');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '50');
});

test('admin groups page size memory respects its feature switches', async () => {
  const origin = 'https://groups-page-size-toggle.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '100',
    },
    origin,
    pathname: '/admin/groups',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  environment.getMenuCommand('Sub2API Helper 设置')();
  const globalSwitch = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-feature-global-switch="admin-groups-page-size"]');
  assert.ok(globalSwitch);
  globalSwitch.checked = false;
  globalSwitch.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getGlobalFeatureStorageKey('admin-groups-page-size')), false);

  pageSize.button.parentElement.remove();
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '20');

  environment.sendDocumentClick(remountedPageSize.button);
  remountedPageSize.button.click();
  const pageSize50Option = remountedPageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-groups-page-size')), '100');
});

test('admin users restores and stores its own page size', async () => {
  const origin = 'https://users-page-size.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-users-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '20',
      [getScopedStorageKey(origin, 'admin-accounts-page-size')]: '20',
      [getScopedStorageKey(origin, 'admin-usage-page-size')]: '20',
      [getScopedStorageKey(origin, 'usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/users',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  const pageSize50Option = pageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-users-page-size')), '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-groups-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '20');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-page-size')), '50');

  environment.getMenuCommand('Sub2API Helper 设置')();
  const usersGroup = environment
    .findSettingsRoot()
    .querySelector('section[data-sub2api-settings-group="admin-users"]');
  assert.ok(usersGroup);
  assert.ok(usersGroup.querySelector('input[data-sub2api-feature-global-switch="admin-users-page-size"]'));
  assert.ok(usersGroup.querySelector('input[data-sub2api-feature-page-switch="admin-users-page-size"]'));
});

test('admin users restores page size after its pagination remounts', async () => {
  const origin = 'https://users-page-size-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-users-page-size')]: '100',
    },
    origin,
    pathname: '/admin/users',
  });
  const initialPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(initialPageSize.button.textContent, '100');

  initialPageSize.button.parentElement.remove();
  const sameRoutePageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sameRoutePageSize.button.textContent, '100');

  sameRoutePageSize.button.parentElement.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/users');
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '100');
});

test('page size selection state does not cross from admin users to admin groups', async () => {
  const origin = 'https://users-page-size-isolation.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-users-page-size')]: '100',
      [getScopedStorageKey(origin, 'admin-groups-page-size')]: '50',
    },
    origin,
    pathname: '/admin/users',
  });
  const usersPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(usersPageSize.button.textContent, '100');
  environment.sendDocumentClick(usersPageSize.button);
  usersPageSize.button.click();
  usersPageSize.button.click();

  usersPageSize.button.parentElement.remove();
  environment.setLocation('/admin/groups');
  const groupsPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(groupsPageSize.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-users-page-size')), '100');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-groups-page-size')), '50');
});

test('admin users page size memory respects its feature switches', async () => {
  const origin = 'https://users-page-size-toggle.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-users-page-size')]: '100',
    },
    origin,
    pathname: '/admin/users',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  environment.getMenuCommand('Sub2API Helper 设置')();
  const globalSwitch = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-feature-global-switch="admin-users-page-size"]');
  assert.ok(globalSwitch);
  globalSwitch.checked = false;
  globalSwitch.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getGlobalFeatureStorageKey('admin-users-page-size')), false);

  pageSize.button.parentElement.remove();
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '20');

  environment.sendDocumentClick(remountedPageSize.button);
  remountedPageSize.button.click();
  const pageSize50Option = remountedPageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(remountedPageSize.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-users-page-size')), '100');
});

test('admin users ignores numeric filter options after the page size menu closes', async () => {
  const origin = 'https://users-page-size-numeric-filter.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-users-page-size')]: '100',
    },
    origin,
    pathname: '/admin/users',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50', '100'],
    value: '20',
  });
  const groupFilter = environment.createSelectControl({
    labelText: '全部分组',
    options: ['全部', '50'],
    value: '全部',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(pageSize.button.textContent, '100');

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  assert.equal(pageSize.button.getAttribute('aria-expanded'), 'true');
  pageSize.button.click();
  assert.equal(pageSize.button.getAttribute('aria-expanded'), 'false');

  environment.sendDocumentClick(groupFilter.button);
  groupFilter.button.click();
  const numericGroupOption = groupFilter.findOption('50');
  environment.sendDocumentClick(numericGroupOption);
  numericGroupOption.click();
  await flushMicrotasks();

  assert.equal(groupFilter.button.textContent, '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-users-page-size')), '100');
});

test('admin accounts keeps group filter changes after the group button loses its tag', async () => {
  const origin = 'https://accounts-untagged-group.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-filter-group')]: 'OpenAI',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(environment);
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(filters.group.button.textContent, 'OpenAI');

  delete filters.group.button.dataset.sub2apiAdminAccountsFilterId;
  delete filters.group.button.attributes['data-sub2api-admin-accounts-filter-id'];

  environment.sendDocumentClick(filters.group.button);
  filters.group.button.click();
  const allGroupsOption = filters.group.findOption('全部分组');
  environment.sendDocumentClick(allGroupsOption);
  allGroupsOption.click();

  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(filters.group.button.textContent, '全部分组');
  assert.equal(
    environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-group')),
    '全部分组',
  );
});

test('admin accounts falls back to all groups when the saved group is unavailable', async () => {
  const origin = 'https://accounts-missing-group.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-filter-group')]: 'Deleted Group',
    },
    origin,
    pathname: '/admin/accounts',
  });
  const filters = createAdminAccountsFilters(environment, ['全部分组', '未分配分组', '订阅']);
  filters.group.button.textContent = '订阅';
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(filters.group.button.textContent, '全部分组');
  assert.equal(
    environment.getStoredValue(getScopedStorageKey(origin, 'admin-accounts-filter-group')),
    '全部分组',
  );
});

test('system theme mode follows browser preference using the actual html dark class', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    origin,
    pathname: '/admin/accounts',
    preferredColorScheme: 'light',
  });
  const themeToggle = environment.createThemeToggle({
    dark: true,
    localStorageTheme: 'light',
  });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.document.documentElement.classList.contains('dark'), false);
  assert.equal(themeToggle.textContent, '深色模式');
  assert.equal(themeToggle.clickCount, 1);

  environment.setPreferredColorScheme('dark');
  await flushMicrotasks();

  assert.equal(environment.document.documentElement.classList.contains('dark'), true);
  assert.equal(themeToggle.textContent, '浅色模式');
  assert.equal(themeToggle.clickCount, 2);
});

test('stored light theme mode ignores dark browser preference', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalSettingsStorageKey('theme-mode')]: 'light',
    },
    origin,
    pathname: '/admin/accounts',
    preferredColorScheme: 'dark',
  });
  const themeToggle = environment.createThemeToggle({ dark: true });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.document.documentElement.classList.contains('dark'), false);
  assert.equal(themeToggle.textContent, '深色模式');
  assert.equal(themeToggle.clickCount, 1);
});

test('stored theme mode still applies when the legacy theme sync feature switch is off', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('theme-sync')]: false,
      [getGlobalSettingsStorageKey('theme-mode')]: 'dark',
    },
    origin,
    pathname: '/admin/accounts',
    preferredColorScheme: 'light',
  });
  const themeToggle = environment.createThemeToggle({ dark: false });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.document.documentElement.classList.contains('dark'), true);
  assert.equal(themeToggle.textContent, '浅色模式');
  assert.equal(themeToggle.clickCount, 1);
});

test('settings panel stores a fixed dark theme mode from the theme mode selector', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    origin,
    pathname: '/admin/accounts',
    preferredColorScheme: 'light',
  });
  const themeToggle = environment.createThemeToggle({ dark: false });
  environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  const darkOption = settingsRoot.querySelector('input[data-sub2api-theme-mode-option="dark"]');
  assert.ok(darkOption);
  darkOption.checked = true;
  darkOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getGlobalSettingsStorageKey('theme-mode')), 'dark');
  assert.equal(environment.document.documentElement.classList.contains('dark'), true);
  assert.equal(themeToggle.textContent, '浅色模式');
  assert.equal(themeToggle.clickCount, 1);
  assert.equal(environment.findSettingsRoot().querySelector('input[data-sub2api-theme-mode-option="dark"]').checked, true);
});

test('settings panel stores compact sidebar width mode for the current origin', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const compactOption = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-mode-option="compact"]');
  assert.ok(compactOption);

  compactOption.checked = true;
  compactOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-mode')), 'compact');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '160px');
  assert.equal(
    environment.findSettingsRoot().querySelector('input[data-sub2api-sidebar-width-mode-option="compact"]').checked,
    true,
  );
});

test('settings panel stores original sidebar width mode for the current origin', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const defaultOption = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-mode-option="default"]');
  assert.ok(defaultOption);
  assert.equal(defaultOption.parentElement.textContent.includes('原始'), true);

  defaultOption.checked = true;
  defaultOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-mode')), 'default');
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
  assert.equal(
    environment.findSettingsRoot().querySelector('input[data-sub2api-sidebar-width-mode-option="default"]').checked,
    true,
  );
});

test('settings panel keeps the same scroll container when applying option changes', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  const scrollContainer = settingsRoot.children[0].children[2];
  scrollContainer.scrollTop = 240;
  const compactOption = scrollContainer.querySelector('input[data-sub2api-sidebar-width-mode-option="compact"]');
  assert.ok(compactOption);

  compactOption.checked = true;
  compactOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const updatedScrollContainer = environment.findSettingsRoot().children[0].children[2];
  assert.equal(updatedScrollContainer === scrollContainer, true);
  assert.equal(updatedScrollContainer.scrollTop, 240);
  assert.equal(compactOption.checked, true);
});

test('settings panel updates status card styles without rebuilding when all relevant features are disabled', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  const statusCard = settingsRoot.children[0].children[1];
  const scrollContainer = settingsRoot.children[0].children[2];
  assert.equal(settingsRoot.dataset.sub2apiSettingsEffectiveEnabled, 'true');
  assert.equal(statusCard.style.background, '#ecfdf5');

  for (const featureId of [
    'sidebar-state',
    'usage-date-range',
    'usage-granularity',
    'usage-page-size',
    'usage-auto-refresh',
  ]) {
    const switchInput = environment
      .findSettingsRoot()
      .querySelector(`input[data-sub2api-feature-global-switch="${featureId}"]`);
    assert.ok(switchInput);
    switchInput.checked = false;
    switchInput.dispatchEvent({ type: 'change' });
    await flushMicrotasks();
  }

  assert.equal(environment.findSettingsRoot().children[0].children[2] === scrollContainer, true);
  assert.equal(settingsRoot.dataset.sub2apiSettingsEffectiveEnabled, 'false');
  assert.match(settingsRoot.textContent, /修改功能: 已关闭/);
  assert.equal(statusCard.style.background, '#f8fafc');
  assert.equal(statusCard.style.border, '1px solid #e2e8f0');
});

test('settings panel stores custom sidebar width for the current origin', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const customOption = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-mode-option="custom"]');
  assert.ok(customOption);

  customOption.checked = true;
  customOption.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const customInput = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-sidebar-width-custom-input="true"]');
  assert.ok(customInput);
  customInput.value = '184';
  customInput.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-mode')), 'custom');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'sidebar-width-px')), 184);
  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, 'true');
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '184px');
  assert.equal(
    environment.findSettingsRoot().querySelector('input[data-sub2api-sidebar-width-custom-input="true"]').value,
    '184',
  );
});

test('sidebar width storage is isolated per Sub2API origin', async () => {
  const origin = 'https://team-b.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey('https://team-a.sub2api.example.test', 'sidebar-width-mode')]: 'compact',
      [getScopedStorageKey(origin, 'sidebar-width-mode')]: 'custom',
      [getScopedStorageKey(origin, 'sidebar-width-px')]: 176,
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '176px');
});

test('metadata targets generic Sub2API deployments', () => {
  assert.match(source, /\/\/ @name\s+Sub2API Helper/);
  assert.match(source, /\/\/ @namespace\s+https:\/\/github\.com\/skt-shinyruo\/tampermonkey-scripts/);
  assert.match(source, /\/\/ @match\s+\*:\/\/\*\/\*/);
  assert.match(source, /\/\/ @grant\s+GM_registerMenuCommand/);
  assert.match(source, /\/\/ @run-at\s+document-start/);
});

test('usage summary adds cache hit rate on user and admin usage pages', async () => {
  for (const pathname of ['/usage', '/admin/usage']) {
    const origin = `https://${pathname === '/usage' ? 'user' : 'admin'}.sub2api.example.test`;
    const environment = createTestEnvironment({ origin, pathname });
    createUsageFingerprint(environment);
    const summary = pathname === '/usage'
      ? createUsageTokenSummary(environment)
      : createUsageTokenSummary(environment, {
        cache: '1000',
        cacheCreation: '400',
        cacheRead: '600',
        input: '1000',
      });

    vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
    await flushMicrotasks();

    const separator = summary.line.querySelector(
      '[data-sub2api-usage-cache-hit-rate-separator="true"]',
    );
    const rate = summary.line.querySelector('[data-sub2api-usage-cache-hit-rate="true"]');
    assert.equal(separator.textContent, '/');
    assert.equal(rate.textContent, pathname === '/usage' ? '命中率: 93.55%' : '命中率: 30.00%');
    assert.equal(separator.parentElement, summary.line);
    assert.equal(rate.parentElement, summary.line);
    assert.equal(summary.line.children[summary.line.children.length - 2], separator);
    assert.equal(summary.line.children[summary.line.children.length - 1], rate);

    environment.runMutationObservers();
    environment.runMutationObservers();
    await flushMicrotasks();
    assert.equal(summary.line.querySelectorAll('[data-sub2api-usage-cache-hit-rate="true"]').length, 1);
    assert.equal(summary.line.querySelectorAll(
      '[data-sub2api-usage-cache-hit-rate-separator="true"]',
    ).length, 1);
  }
});

test('usage summary adds income between account cost and standard cost', async () => {
  for (const pathname of ['/usage', '/admin/usage']) {
    const origin = `https://${pathname === '/usage' ? 'user-income' : 'admin-income'}.sub2api.example.test`;
    const environment = createTestEnvironment({ origin, pathname });
    createUsageFingerprint(environment);
    const summary = createUsageCostSummary(environment);

    vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
    await flushMicrotasks();

    const separator = summary.line.querySelector('[data-sub2api-usage-income-separator="true"]');
    const income = summary.line.querySelector('[data-sub2api-usage-income="true"]');
    const children = [...summary.line.children];
    assert.equal(separator.textContent, ' · ');
    assert.equal(income.textContent, '收入 $7.8288');
    assert.equal(income.title, '收入 = 总消费 - 成本');
    assert.equal(income.getAttribute('aria-label'), '收入');
    assert.equal(income.className, 'text-emerald-600 dark:text-emerald-400');
    assert.equal(children[0], summary.accountCostElement);
    assert.equal(children[1], separator);
    assert.equal(children[2], income);
    assert.equal(children[3].textContent, ' · ');
    assert.equal(summary.line.querySelectorAll('[data-sub2api-usage-income="true"]').length, 1);

    summary.totalAmount.textContent = '$10.0000';
    summary.accountCostElement.textContent = '成本 $4.2500';
    environment.runMutationObservers();
    await flushMicrotasks();

    assert.equal(summary.line.querySelector('[data-sub2api-usage-income="true"]').textContent, '收入 $5.7500');
    assert.equal(summary.line.querySelectorAll('[data-sub2api-usage-income="true"]').length, 1);
    assert.equal(summary.line.querySelectorAll('[data-sub2api-usage-income-separator="true"]').length, 1);
  }
});

test('usage summary income follows the cost card language and sign', async () => {
  const origin = 'https://income-language.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const english = createUsageCostSummary(environment, {
    accountCost: '$2.5000',
    language: 'en',
    total: '$1.0000',
  });
  const withoutAccountCost = createUsageCostSummary(environment, {
    includeAccountCost: false,
    total: '$9.0000',
  });
  const strayCost = environment.document.createElement('span');
  strayCost.textContent = '成本 $3.0000';
  environment.document.body.appendChild(strayCost);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const income = english.line.querySelector('[data-sub2api-usage-income="true"]');
  assert.equal(income.textContent, 'Income -$1.5000');
  assert.equal(income.title, 'Income = Total Cost - Cost');
  assert.equal(income.className, 'text-red-600 dark:text-red-400');
  assert.equal(withoutAccountCost.line.querySelector('[data-sub2api-usage-income="true"]'), null);
  assert.equal(environment.document.querySelectorAll('[data-sub2api-usage-income="true"]').length, 1);
});

test('usage table leaves the user-agent cell unchanged on admin usage rows', async () => {
  const origin = 'https://admin.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const table = createUsageEnhancementTable(environment, [
    {
      id: 401,
      model: 'gpt-5.5',
      type: '流式',
      userAgent: 'codex-tui/0.140.0 (Ubuntu 24.4.0; x86_64)',
      tokens: '40 / 1,010',
      cost: '$0.012345',
      firstToken: '1.50s',
      duration: '20.58s',
    },
  ]);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.setFetchResponse('/api/v1/admin/usage', buildUsageListResponse([
    {
      id: 401,
      request_id: 'client:6978e273-d9c5-45ff-9d99-c0520c170830',
      request_type: 'stream',
      stream: true,
      output_tokens: 1010,
      duration_ms: 20580,
      first_token_ms: 1500,
      actual_cost: 0.012345,
      service_tier: 'priority',
    },
  ]));
  await environment.vmContext.fetch(`${origin}/api/v1/admin/usage?page=1&page_size=20`);
  await flushMicrotasks();
  environment.runMutationObservers();
  await flushMicrotasks();

  const userAgentCell = table.getCell(401, 'userAgent');
  assert.equal(userAgentCell.textContent, 'codex-tui/0.140.0 (Ubuntu 24.4.0; x86_64)');
  const stack = userAgentCell.querySelector('[data-sub2api-usage-user-agent-stack="true"]');
  const userAgentValue = userAgentCell.querySelector('[data-sub2api-usage-user-agent-value="true"]');
  const requestIdValue = userAgentCell.querySelector('[data-sub2api-usage-request-id-value="true"]');
  assert.equal(stack, null);
  assert.equal(userAgentValue, null);
  assert.equal(requestIdValue, null);
});

test('usage table adds row cache hit rate from usage API on user and admin pages', async () => {
  for (const { pathname, apiPath, originHost } of [
    { pathname: '/usage', apiPath: '/api/v1/usage', originHost: 'user' },
    { pathname: '/admin/usage', apiPath: '/api/v1/admin/usage', originHost: 'admin' },
  ]) {
    const origin = `https://${originHost}.sub2api.example.test`;
    const environment = createTestEnvironment({ origin, pathname });
    if (pathname === '/usage') {
      createUsageFingerprint(environment);
    } else {
      environment.createDatePicker({
        activePresetLabel: '近24小时',
        presetLabels: ['今天', '近24小时'],
        triggerText: '近24小时',
      });
      environment.createSelectControl({
        labelText: '粒度:',
        options: ['按小时', '按天'],
        value: '按小时',
      });
    }

    const table = createUsageEnhancementTable(environment, [
      {
        id: 501,
        model: 'claude-sonnet',
        type: '流式',
        tokensStack: true,
        inputTokens: 40,
        outputTokens: 100,
        cacheReadTokens: 600,
        cacheCreationTokens: 0,
        ioLineWidth: 120,
        cacheLineWidth: 80,
        cost: '$0.01',
        firstToken: '1.00s',
        duration: '10.00s',
      },
      {
        id: 502,
        model: 'claude-sonnet',
        type: '流式',
        tokensStack: true,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        cost: '$0.02',
        firstToken: '1.00s',
        duration: '8.00s',
      },
      {
        id: 503,
        model: 'image-model',
        type: '图片',
        tokens: '2张',
        cost: '$0.03',
        firstToken: '-',
        duration: '-',
      },
      {
        id: 504,
        model: 'claude-sonnet',
        type: '流式',
        tokensStack: true,
        inputTokens: 10,
        outputTokens: 20,
        cost: '$0.04',
        firstToken: '0.50s',
        duration: '2.00s',
      },
      {
        id: 505,
        model: 'claude-sonnet',
        type: '流式',
        tokensStack: true,
        inputTokens: 4,
        outputTokens: 468,
        cacheReadTokens: 148300,
        cacheCreationTokens: 9000,
        ioLineWidth: 70,
        cacheLineWidth: 180,
        cost: '$0.05',
        firstToken: '0.40s',
        duration: '5.00s',
      },
    ]);

    vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
    await flushMicrotasks();

    environment.setFetchResponse(apiPath, buildUsageListResponse([
      {
        id: 501,
        request_id: 'req-501',
        input_tokens: 40,
        cache_creation_tokens: 0,
        cache_read_tokens: 600,
        output_tokens: 100,
      },
      {
        id: 502,
        request_id: 'req-502',
        input_tokens: 100,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        output_tokens: 50,
      },
      {
        id: 503,
        request_id: 'req-503',
        image_count: 2,
        billing_mode: 'image',
        input_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
      },
      {
        id: 504,
        request_id: 'req-504',
        input_tokens: 10,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        output_tokens: 20,
      },
      {
        id: 505,
        request_id: 'req-505',
        input_tokens: 4,
        cache_creation_tokens: 9000,
        cache_read_tokens: 148300,
        output_tokens: 468,
      },
    ]));
    await environment.vmContext.fetch(`${origin}${apiPath}?page=1&page_size=20`);
    await flushMicrotasks();
    environment.runMutationObservers();
    await flushMicrotasks();

    const tokens501 = table.getCell(501, 'tokens');
    const hit501 = tokens501.querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    const hit502 = table.getCell(502, 'tokens')
      .querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    const hit503 = table.getCell(503, 'tokens')
      .querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    const hit504 = table.getCell(504, 'tokens')
      .querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    const tokens505 = table.getCell(505, 'tokens');
    const hit505 = tokens505.querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    const cacheRead501 = [...tokens501.querySelectorAll('span')]
      .find((element) => element.className.includes('text-sky-600'));
    const cacheReadGroup501 = cacheRead501?.parentElement;
    const cacheRead505 = [...tokens505.querySelectorAll('span')]
      .find((element) =>
        element.className.includes('text-sky-600') &&
        element.dataset.sub2apiUsageRowCacheHitRate !== 'true',
      );
    const cacheWrite505 = [...tokens505.querySelectorAll('span')]
      .find((element) => element.className.includes('text-amber-600'));
    const cacheReadGroup505 = cacheRead505?.parentElement;
    const cacheWriteGroup505 = cacheWrite505?.parentElement;

    const separator501 = tokens501.querySelector(
      '[data-sub2api-usage-row-cache-hit-rate-separator="true"]',
    );
    const separator505 = tokens505.querySelector(
      '[data-sub2api-usage-row-cache-hit-rate-separator="true"]',
    );
    assert.equal(hit501?.textContent, '94%');
    assert.equal(separator501?.textContent, '/');
    assert.equal(
      hit501?.title,
      '缓存命中率 = 缓存读取 / (输入 + 缓存创建 + 缓存读取)；≥90% 好 / 80–90% 一般 / 60–80% 偏低 / <60% 差',
    );
    assert.equal(hit501?.className.includes('text-emerald-600'), true);
    assert.equal(hit501?.className.includes('dark:text-emerald-400'), true);
    assert.equal(hit502?.className.includes('text-red-600'), true);
    assert.equal(hit505?.className.includes('text-emerald-600'), true);
    assert.equal(hit501?.parentElement, cacheReadGroup501?.parentElement);
    assert.equal(separator501?.parentElement, cacheReadGroup501?.parentElement);
    assert.equal(
      [...hit501.parentElement.children].indexOf(separator501),
      [...hit501.parentElement.children].indexOf(cacheReadGroup501) + 1,
    );
    assert.equal(
      [...hit501.parentElement.children].indexOf(hit501),
      [...hit501.parentElement.children].indexOf(separator501) + 1,
    );
    const tokens502 = table.getCell(502, 'tokens');
    const separator502 = tokens502.querySelector(
      '[data-sub2api-usage-row-cache-hit-rate-separator="true"]',
    );
    assert.equal(hit502?.textContent, '0%');
    assert.equal(separator502?.textContent, '·');
    assert.equal(hit502?.parentElement?.className.includes('flex'), true);
    assert.equal(
      [...hit502.parentElement.children].indexOf(hit502),
      [...hit502.parentElement.children].indexOf(separator502) + 1,
    );
    assert.equal(hit503, null);
    assert.equal(hit504?.textContent, '0%');
    assert.equal(
      table.getCell(504, 'tokens').querySelector(
        '[data-sub2api-usage-row-cache-hit-rate-separator="true"]',
      )?.textContent,
      '·',
    );
    // Cache line wider than IO → hit rate goes to IO tail.
    assert.equal(hit505?.textContent, '94%');
    assert.equal(separator505?.textContent, '·');
    assert.equal(hit505?.parentElement?.className.includes('flex'), true);
    assert.notEqual(hit505?.parentElement, cacheReadGroup505?.parentElement);
    assert.deepEqual(
      [...cacheReadGroup505.parentElement.children],
      [cacheReadGroup505, cacheWriteGroup505],
    );
  }
});

test('usage table colors row cache hit rate by severity bands', async () => {
  const origin = 'https://hit-rate-color.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);

  const rows = [
    { id: 701, input: 10, creation: 0, read: 90, className: 'text-emerald-600' }, // 90%
    { id: 702, input: 15, creation: 0, read: 85, className: 'text-amber-600' }, // 85%
    { id: 703, input: 25, creation: 0, read: 75, className: 'text-orange-600' }, // 75%
    { id: 704, input: 35, creation: 0, read: 65, className: 'text-orange-600' }, // 65% gap → slow
    { id: 705, input: 50, creation: 0, read: 50, className: 'text-red-600' }, // 50%
  ];

  const table = createUsageEnhancementTable(
    environment,
    rows.map((row) => ({
      id: row.id,
      model: 'claude-sonnet',
      type: '流式',
      tokensStack: true,
      inputTokens: row.input,
      outputTokens: 1,
      cacheReadTokens: row.read,
      cacheCreationTokens: row.creation,
      cost: '$0.01',
      firstToken: '1.00s',
      duration: '2.00s',
    })),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.setFetchResponse('/api/v1/usage', buildUsageListResponse(
    rows.map((row) => ({
      id: row.id,
      request_id: `req-${row.id}`,
      input_tokens: row.input,
      cache_creation_tokens: row.creation,
      cache_read_tokens: row.read,
      output_tokens: 1,
    })),
  ));
  await environment.vmContext.fetch(`${origin}/api/v1/usage?page=1&page_size=20`);
  await flushMicrotasks();
  environment.runMutationObservers();
  await flushMicrotasks();

  for (const row of rows) {
    const hit = table.getCell(row.id, 'tokens')
      .querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]');
    assert.equal(hit?.className.includes(row.className), true, `row ${row.id}`);
  }
});

test('usage table skips row cache hit rate when API row is missing from cache', async () => {
  const origin = 'https://user.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);
  const table = createUsageEnhancementTable(environment, [
    {
      id: 601,
      model: 'claude-sonnet',
      type: '流式',
      tokensStack: true,
      inputTokens: 40,
      outputTokens: 100,
      cacheReadTokens: 600,
      cost: '$0.01',
      firstToken: '1.00s',
      duration: '10.00s',
    },
  ]);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(
    table.getCell(601, 'tokens').querySelector('[data-sub2api-usage-row-cache-hit-rate="true"]'),
    null,
  );
});


test('settings panel shows Sub2API detection and per-feature switches for the current page', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const openSettings = environment.getMenuCommand('Sub2API Helper 设置');
  assert.equal(typeof openSettings, 'function');

  openSettings();
  const settingsRoot = environment.findSettingsRoot();
  assert.ok(settingsRoot);
  assert.equal(settingsRoot.dataset.sub2apiSettingsIsSub2api, 'true');
  assert.equal(settingsRoot.dataset.sub2apiSettingsEffectiveEnabled, 'true');
  assert.match(settingsRoot.textContent, /脚本版本: \d+\.\d+\.\d+/);
  assert.match(environment.findSettingsLauncherButton().dataset.sub2apiSettingsLauncherVersion, /^\d+\.\d+\.\d+$/);
  assert.match(environment.document.documentElement.dataset.sub2apiHelperVersion, /^\d+\.\d+\.\d+$/);
  assert.match(settingsRoot.textContent, /当前页面: Sub2API 页面/);
  assert.match(settingsRoot.textContent, /修改功能: 生效中/);
  assert.equal(settingsRoot.querySelector('[data-sub2api-settings-global-switch="true"]'), null);
  assert.equal(settingsRoot.querySelector('[data-sub2api-settings-page-switch="true"]'), null);
  assert.match(settingsRoot.textContent, /主题模式/);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-theme-mode-option="system"]').checked, true);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-theme-mode-option="light"]').checked, false);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-theme-mode-option="dark"]').checked, false);
  assert.match(settingsRoot.textContent, /使用记录自动刷新/);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="usage-auto-refresh"]').checked, true);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-page-switch="usage-auto-refresh"]').checked, true);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="sidebar-state"]').checked, true);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-page-switch="sidebar-state"]').checked, true);
});

test('settings panel distinguishes feature switches and descriptions by Sub2API tab', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();

  assert.match(settingsRoot.textContent, /使用记录 tab \(/);
  assert.match(settingsRoot.textContent, /管理端使用记录 tab \(/);
  assert.match(settingsRoot.textContent, /仪表盘 tab \(/);
  assert.match(settingsRoot.textContent, /管理端仪表盘 tab \(/);
  assert.ok(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="usage-date-range"]'));
  assert.ok(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="admin-usage-date-range"]'));
  assert.ok(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="dashboard-date-range"]'));
  assert.ok(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="admin-dashboard-date-range"]'));
});

test('settings panel groups usage features under the same tab section', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/usage' });
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();

  const usageGroup = settingsRoot.querySelector('section[data-sub2api-settings-group="usage"]');
  assert.ok(usageGroup);
  assert.match(usageGroup.children[0].textContent, /使用记录 tab \(\/usage\)/);
  assert.ok(usageGroup.querySelector('input[data-sub2api-feature-global-switch="usage-date-range"]'));
  assert.ok(usageGroup.querySelector('input[data-sub2api-feature-global-switch="usage-granularity"]'));
  assert.ok(usageGroup.querySelector('input[data-sub2api-feature-global-switch="usage-page-size"]'));
  assert.ok(usageGroup.querySelector('input[data-sub2api-feature-global-switch="usage-auto-refresh"]'));
});

test('global feature switch disables only that feature on Sub2API pages', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.ok(environment.findAutoRefreshButton());

  environment.getMenuCommand('Sub2API Helper 设置')();
  const dateRangeSwitch = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-feature-global-switch="usage-date-range"]');
  dateRangeSwitch.checked = false;
  dateRangeSwitch.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&start_date=2026-04-17&end_date=2026-04-23&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(environment.getStoredValue(getGlobalFeatureStorageKey('usage-date-range')), false);
  assert.ok(environment.findAutoRefreshButton());
  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);
  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-17');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');

  const restoredDateRangeSwitch = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-feature-global-switch="usage-date-range"]');
  restoredDateRangeSwitch.checked = true;
  restoredDateRangeSwitch.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const restoredResponse = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&start_date=2026-04-17&end_date=2026-04-23&timezone=Asia%2FShanghai`,
  );
  const restoredRequestUrl = new URL(restoredResponse.url);

  assert.equal(environment.getStoredValue(getGlobalFeatureStorageKey('usage-date-range')), true);
  assert.ok(environment.findAutoRefreshButton());
  assert.equal(restoredRequestUrl.searchParams.get('start_date'), '2026-04-23');
  assert.equal(restoredRequestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('current page feature switch disables only that feature on the current pathname', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'sidebar-collapsed')]: true,
      [getPageFeatureStorageKey(origin, '/usage', 'sidebar-state')]: false,
    },
    origin,
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });
  createUsageFingerprint(environment);
  const sidebarToggle = environment.createSidebarToggle({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '收起');
  assert.equal(sidebarToggle.clickCount, 0);
  assert.ok(environment.findAutoRefreshButton());

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  assert.equal(settingsRoot.dataset.sub2apiSettingsIsSub2api, 'true');
  assert.equal(settingsRoot.dataset.sub2apiSettingsEffectiveEnabled, 'true');
  assert.match(settingsRoot.textContent, /修改功能: 生效中/);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-global-switch="sidebar-state"]').checked, true);
  assert.equal(settingsRoot.querySelector('input[data-sub2api-feature-page-switch="sidebar-state"]').checked, false);

  environment.setLocation('/admin/accounts');
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(sidebarToggle.textContent, '展开');
  assert.equal(sidebarToggle.clickCount, 1);
});

test('current page auto-refresh switch removes only the injected auto-refresh control', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.ok(environment.findAutoRefreshButton());

  environment.getMenuCommand('Sub2API Helper 设置')();
  const autoRefreshPageSwitch = environment
    .findSettingsRoot()
    .querySelector('input[data-sub2api-feature-page-switch="usage-auto-refresh"]');
  autoRefreshPageSwitch.checked = false;
  autoRefreshPageSwitch.dispatchEvent({ type: 'change' });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&start_date=2026-04-17&end_date=2026-04-23&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(environment.getStoredValue(getPageFeatureStorageKey(origin, '/usage', 'usage-auto-refresh')), false);
  assert.equal(environment.findAutoRefreshButton(), null);
  assert.deepEqual(environment.getIntervalDurations(), [1000]);
  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-23');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('in-page settings button appears on Sub2API pages and opens settings', async () => {
  const environment = createTestEnvironment({
    origin: 'https://sub2api.example.test',
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const settingsButton = environment.findSettingsLauncherButton();
  assert.ok(settingsButton);
  settingsButton.click();

  assert.ok(environment.findSettingsRoot());
});

test('settings panel reports non-Sub2API pages without activating modifications', async () => {
  const environment = createTestEnvironment({
    appConfig: null,
    origin: 'https://docs.example.test',
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();

  assert.equal(settingsRoot.dataset.sub2apiSettingsIsSub2api, 'false');
  assert.equal(settingsRoot.dataset.sub2apiSettingsEffectiveEnabled, 'false');
  assert.match(settingsRoot.textContent, /当前页面: 非 Sub2API 页面/);
  assert.match(settingsRoot.textContent, /修改功能: 当前页面不匹配/);
  assert.equal(environment.findSettingsLauncherButton(), null);
  assert.equal(environment.findAutoRefreshButton(), null);
  assert.deepEqual(environment.getIntervalDurations(), []);
});

test('does not activate from sidebar controls without a Sub2API app fingerprint', async () => {
  const environment = createTestEnvironment({
    appConfig: null,
    origin: 'https://generic.example.test',
    pathname: '/',
  });
  const expandButton = environment.document.createElement('button');
  expandButton.textContent = '展开';
  expandButton.className = 'sidebar-link';
  environment.document.body.appendChild(expandButton);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.findSettingsLauncherButton(), null);
  assert.deepEqual(environment.getIntervalDurations(), []);
});

test('does not activate on a generic usage path without Sub2API UI fingerprint', async () => {
  const environment = createTestEnvironment({
    appConfig: null,
    origin: 'https://docs.example.test',
    pathname: '/usage',
    savedAutoRefreshValue: '5000',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.findAutoRefreshButton(), null);
  assert.deepEqual(environment.getIntervalDurations(), []);
});

test('returning to foreground refreshes once before restarting countdown', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

test('ordinary DOM mutations after activation do not restart auto refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const createdIntervalCount = environment.getCreatedIntervalCount();
  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);

  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(environment.getCreatedIntervalCount(), createdIntervalCount);
  assert.deepEqual(environment.getIntervalDurations(), [1000, 1000, 5000]);
});

test('blur before visibilitychange does not trigger a foreground refresh', async () => {
  const environment = createTestEnvironment({ savedAutoRefreshValue: '5000' });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

test('usage restores saved date range through picker clicks after SPA tab switch', async () => {
  const origin = 'https://sub2api.example.test';
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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
  const clickCounts = currentPicker.getClickCounts();
  assert.equal(clickCounts.trigger, 1);
  assert.equal(clickCounts.presets.get('近 30 天'), 1);
  assert.equal(clickCounts.apply, 1);
});

test('usage restores saved date range again after the trigger text resets to default', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '近 30 天' },
    },
    origin,
    pathname: '/usage',
  });
  const datePicker = createUsageFingerprint(environment).datePicker;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');

  datePicker.trigger.textContent = '今天';
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
});

test('usage restores saved date range again when a delayed picker update resets to the original default', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '近 30 天' },
    },
    origin,
    pathname: '/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    deferApplyTriggerUpdate: true,
    presetLabels: ['近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');

  datePicker.trigger.textContent = '近 7 天';
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
});

test('usage request rewriting still follows saved range when picker clicks are ignored', async () => {
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&page_size=50&start_date=2026-04-17&end_date=2026-04-23&sort_by=created_at&sort_order=desc&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(datePicker.trigger.textContent, '近 7 天');
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
});

test('admin usage ignores saved user usage date range when no admin range is saved', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近24小时');
});

test('admin usage and user usage store separate date range, granularity, and page size values', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'usage-date-range')]: { type: 'preset', label: '今天' },
      [getScopedStorageKey(origin, 'usage-granularity')]: '按天',
      [getScopedStorageKey(origin, 'usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  datePicker.open();
  datePicker.findPreset('近 7 天').click();
  environment.sendDocumentClick(datePicker.getApplyButton());
  datePicker.getApplyButton().click();

  environment.sendDocumentClick(granularity.button);
  granularity.button.click();
  const hourlyOption = granularity.findOption('按小时');
  environment.sendDocumentClick(hourlyOption);
  hourlyOption.click();

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  const pageSize20Option = pageSize.findOption('20');
  environment.sendDocumentClick(pageSize20Option);
  pageSize20Option.click();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, 'usage-date-range')))), {
    type: 'preset',
    label: '今天',
  });
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-granularity')), '按天');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-page-size')), '50');
  assert.deepEqual(JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-date-range')))), {
    type: 'preset',
    label: '近 7 天',
  });
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-granularity')), '按小时');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '20');
});

test('admin usage restores saved date range and granularity on load', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '近 30 天' },
      [getScopedStorageKey(origin, 'admin-usage-granularity')]: '按天',
    },
    origin,
    pathname: '/admin/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['近24小时', '近 7 天', '近 30 天'],
    triggerText: '近24小时',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
  assert.equal(granularity.button.textContent, '按天');
});

test('admin usage restores saved date range after returning from promo code tab', async () => {
  const origin = 'https://admin-usage-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/promo-codes',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '今天');

  datePicker.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  const remountedDatePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(remountedDatePicker.trigger.textContent, '今天');
});

test('admin usage waits for remounted date picker after SPA route changes before restoring range', async () => {
  const origin = 'https://admin-usage-delayed-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const initialDatePicker = environment.createDatePicker({
    activePresetLabel: '今天',
    presetLabels: ['今天', '近24小时'],
    triggerText: '今天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  initialDatePicker.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  environment.runMutationObservers();

  const remountedDatePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  await flushMicrotasks();

  assert.equal(remountedDatePicker.trigger.textContent, '今天');
});

test('admin usage retries saved date range restore when the first SPA picker open is ignored', async () => {
  const origin = 'https://admin-usage-ignored-open.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const initialDatePicker = environment.createDatePicker({
    activePresetLabel: '今天',
    presetLabels: ['今天', '近24小时'],
    triggerText: '今天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  initialDatePicker.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  environment.runMutationObservers();
  const remountedDatePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    bubbleProgrammaticClicks: true,
    ignoredTriggerClicks: 1,
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  await flushMicrotasks();

  assert.equal(remountedDatePicker.trigger.textContent, '今天');
  const clickCounts = remountedDatePicker.getClickCounts();
  assert.equal(clickCounts.trigger, 2);
  assert.equal(clickCounts.presets.get('今天'), 1);
  assert.equal(clickCounts.apply, 1);
});

test('admin usage retries saved date range restore until the remounted UI text matches the saved range', async () => {
  const origin = 'https://admin-usage-stale-apply.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const initialDatePicker = environment.createDatePicker({
    activePresetLabel: '今天',
    presetLabels: ['今天', '近24小时'],
    triggerText: '今天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  initialDatePicker.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  environment.runMutationObservers();
  const remountedDatePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    ignoredApplyUpdates: 1,
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  await flushMicrotasks();

  assert.equal(remountedDatePicker.trigger.textContent, '今天');
  const clickCounts = remountedDatePicker.getClickCounts();
  assert.ok(clickCounts.trigger >= 2);
  assert.ok(clickCounts.presets.get('今天') >= 1);
  assert.equal(clickCounts.apply, 2);
});

test('admin usage restores granularity and page size after returning from promo code tab', async () => {
  const origin = 'https://admin-usage-state-spa.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-granularity')]: '按天',
      [getScopedStorageKey(origin, 'admin-usage-page-size')]: '50',
    },
    origin,
    pathname: '/admin/usage',
  });
  const initialDatePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  const initialGranularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const initialPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(initialGranularity.button.textContent, '按天');
  assert.equal(initialPageSize.button.textContent, '50');

  initialDatePicker.remove();
  initialGranularity.button.parentElement.remove();
  initialPageSize.button.parentElement.remove();
  environment.setLocation('/admin/promo-codes');
  environment.runMutationObservers();
  await flushMicrotasks();

  environment.setLocation('/admin/usage');
  environment.runMutationObservers();
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时'],
    triggerText: '近24小时',
  });
  const remountedGranularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const remountedPageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });
  await flushMicrotasks();

  assert.equal(remountedGranularity.button.textContent, '按天');
  assert.equal(remountedPageSize.button.textContent, '50');
});

test('admin usage restores the real picker preset instead of only syncing the label', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  datePicker.open();

  assert.equal(datePicker.trigger.textContent, '今天');
  assert.ok(datePicker.findPreset('今天')?.classList.contains('date-picker-preset-active'));
  assert.equal(datePicker.findPreset('近24小时')?.classList.contains('date-picker-preset-active'), false);
});

test('admin usage does not replay saved date range on ordinary DOM mutations after initial restore', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '近24小时' },
    },
    origin,
    pathname: '/admin/usage',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  datePicker.open();
  const todayPreset = datePicker.findPreset('今天');
  todayPreset.click();
  environment.sendDocumentClick(datePicker.getApplyButton());
  datePicker.getApplyButton().click();
  assert.equal(datePicker.trigger.textContent, '今天');

  environment.runMutationObservers();
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '今天');
  datePicker.open();
  assert.ok(datePicker.findPreset('今天')?.classList.contains('date-picker-preset-active'));
  assert.equal(datePicker.findPreset('近24小时')?.classList.contains('date-picker-preset-active'), false);
});

test('admin usage rewrites usage requests before the admin usage fingerprint is ready', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-05-09T12:00:00+08:00'),
    origin,
    pathname: '/admin/usage',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(requestUrl.searchParams.get('start_date'), '2026-05-09');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-05-09');
});

test('admin usage rewrites admin usage and summary requests before the fingerprint is ready', async () => {
  const origin = 'https://admin-usage-real-apis.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-05-09T12:00:00+08:00'),
    origin,
    pathname: '/admin/usage',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  for (const path of [
    '/api/v1/admin/usage?page=1&start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai',
    '/api/v1/admin/usage/stats?start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai',
    '/api/v1/admin/dashboard/models?start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai',
    '/api/v1/admin/dashboard/snapshot-v2?start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai',
  ]) {
    const response = await environment.vmContext.fetch(`${origin}${path}`);
    const requestUrl = new URL(response.url);

    assert.equal(requestUrl.searchParams.get('start_date'), '2026-05-09');
    assert.equal(requestUrl.searchParams.get('end_date'), '2026-05-09');
  }
});

test('user usage date range feature switch does not disable admin usage date range rewriting', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('usage-date-range')]: false,
      [getScopedStorageKey(origin, 'admin-usage-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-05-09T12:00:00+08:00'),
    origin,
    pathname: '/admin/usage',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage?page=1&start_date=2026-05-08&end_date=2026-05-09&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(requestUrl.searchParams.get('start_date'), '2026-05-09');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-05-09');
});

test('user usage granularity and page size switches do not disable admin usage persistence', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('usage-granularity')]: false,
      [getGlobalFeatureStorageKey('usage-page-size')]: false,
    },
    origin,
    pathname: '/admin/usage',
  });
  environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['今天', '近24小时', '近 7 天'],
    triggerText: '近24小时',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });
  const pageSize = environment.createSelectControl({
    labelText: '每页:',
    options: ['20', '50'],
    value: '20',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.sendDocumentClick(granularity.button);
  granularity.button.click();
  const dailyOption = granularity.findOption('按天');
  environment.sendDocumentClick(dailyOption);
  dailyOption.click();

  environment.sendDocumentClick(pageSize.button);
  pageSize.button.click();
  const pageSize50Option = pageSize.findOption('50');
  environment.sendDocumentClick(pageSize50Option);
  pageSize50Option.click();
  await flushMicrotasks();

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-granularity')), '按天');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-page-size')), '50');
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-granularity')), undefined);
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'usage-page-size')), undefined);
});

test('admin usage stores selected custom date range and granularity', async () => {
  const origin = 'https://admin-usage.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近24小时',
    presetLabels: ['近24小时', '近 7 天', '近 30 天'],
    triggerText: '近24小时',
  });
  const granularity = environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按小时',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  datePicker.setCustomRange('2026-05-01', '2026-05-02');
  environment.sendDocumentClick(datePicker.getApplyButton());
  datePicker.getApplyButton().click();

  environment.sendDocumentClick(granularity.button);
  granularity.button.click();
  const dailyOption = granularity.findOption('按天');
  environment.sendDocumentClick(dailyOption);
  dailyOption.click();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-date-range')))), {
    displayText: buildCustomDisplayText('2026-05-01', '2026-05-02'),
    end: '2026-05-02',
    start: '2026-05-01',
    type: 'custom',
  });
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-usage-granularity')), '按天');
});

test('unscoped legacy storage keys are ignored', async () => {
  const origin = 'https://team-c.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      'unscoped-usage-date-range': {
        type: 'preset',
        label: '今天',
      },
    },
    origin,
    pathname: '/usage',
  });
  const { datePicker } = createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    'https://api.other.example.test/api/v1/usage?page=1&start_date=2026-04-17&end_date=2026-04-23&timezone=Asia%2FShanghai',
  );
  const requestUrl = new URL(response.url);

  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-17');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('dashboard request rewriting still follows saved range when picker clicks are ignored', async () => {
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/usage/dashboard/trend?start_date=2026-04-17&end_date=2026-04-23&granularity=day&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(datePicker.trigger.textContent, '近 7 天');
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
  const clickCounts = datePicker.getClickCounts();
  assert.equal(clickCounts.trigger, 1);
  assert.equal(clickCounts.presets.get('近 30 天'), 1);
  assert.equal(clickCounts.apply, 1);
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

test('admin dashboard rewrites dashboard requests before the page fingerprint is ready', async () => {
  const origin = 'https://admin-dashboard.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-dashboard-date-range')]: { type: 'preset', label: '今天' },
    },
    now: RealDate.parse('2026-04-23T12:00:00+08:00'),
    origin,
    pathname: '/admin/dashboard',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const response = await environment.vmContext.fetch(
    `${origin}/api/v1/admin/dashboard/trend?start_date=2026-04-17&end_date=2026-04-23&granularity=day&timezone=Asia%2FShanghai`,
  );
  const requestUrl = new URL(response.url);

  assert.equal(requestUrl.searchParams.get('start_date'), '2026-04-23');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-04-23');
});

test('admin dashboard ignores saved user dashboard date range when no admin dashboard range is saved', async () => {
  const origin = 'https://admin-dashboard.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'dashboard-date-range')]: { type: 'preset', label: '今天' },
    },
    origin,
    pathname: '/admin/dashboard',
  });
  const datePicker = environment.createDatePicker({
    activePresetLabel: '近 7 天',
    presetLabels: ['今天', '近 7 天', '近 30 天'],
    triggerText: '近 7 天',
  });
  environment.createSelectControl({
    labelText: '粒度:',
    options: ['按小时', '按天'],
    value: '按天',
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 7 天');
});

test('admin dashboard restores saved date range and granularity on load', async () => {
  const origin = 'https://admin-dashboard.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-dashboard-date-range')]: { type: 'preset', label: '近 30 天' },
      [getScopedStorageKey(origin, 'admin-dashboard-granularity')]: '按小时',
    },
    origin,
    pathname: '/admin/dashboard',
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(datePicker.trigger.textContent, '近 30 天');
  const clickCounts = datePicker.getClickCounts();
  assert.equal(clickCounts.trigger, 1);
  assert.equal(clickCounts.presets.get('近 30 天'), 1);
  assert.equal(clickCounts.apply, 1);
  assert.equal(granularity.button.textContent, '按小时');
});

test('admin dashboard stores selected custom date range and granularity', async () => {
  const origin = 'https://admin-dashboard.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/dashboard' });
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

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
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

  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'dashboard-date-range')), undefined);
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'dashboard-granularity')), undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, 'admin-dashboard-date-range')))), {
    displayText: buildCustomDisplayText('2026-04-01', '2026-04-23'),
    end: '2026-04-23',
    start: '2026-04-01',
    type: 'custom',
  });
  assert.equal(environment.getStoredValue(getScopedStorageKey(origin, 'admin-dashboard-granularity')), '按小时');
});

for (const {
  label,
  origin,
  pathname,
  storageName,
  usePageSize,
} of [
  {
    label: 'usage',
    origin: 'https://usage-preset.sub2api.example.test',
    pathname: '/usage',
    storageName: 'usage-date-range',
    usePageSize: true,
  },
  {
    label: 'admin usage',
    origin: 'https://admin-usage-preset.sub2api.example.test',
    pathname: '/admin/usage',
    storageName: 'admin-usage-date-range',
    usePageSize: true,
  },
  {
    label: 'dashboard',
    origin: 'https://dashboard-preset.sub2api.example.test',
    pathname: '/dashboard',
    storageName: 'dashboard-date-range',
    usePageSize: false,
  },
  {
    label: 'admin dashboard',
    origin: 'https://admin-dashboard-preset.sub2api.example.test',
    pathname: '/admin/dashboard',
    storageName: 'admin-dashboard-date-range',
    usePageSize: false,
  },
]) {
  test(`${label} does not replay saved date range over a user preset selection`, async () => {
    const environment = createTestEnvironment({
      gmValues: {
        [getScopedStorageKey(origin, storageName)]: { type: 'preset', label: '今天' },
      },
      origin,
      pathname,
    });
    const datePicker = environment.createDatePicker({
      activePresetLabel: '今天',
      presetClickAppliesImmediately: true,
      presetLabels: ['今天', '近 7 天', '近 30 天'],
      triggerText: '今天',
    });
    if (usePageSize) {
      environment.createSelectControl({
        labelText: '每页:',
        options: ['20', '50'],
        value: '20',
      });
    }
    environment.createSelectControl({
      labelText: '粒度:',
      options: ['按小时', '按天'],
      value: '按小时',
    });

    vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
    await flushMicrotasks();

    datePicker.open();
    const near30DaysPreset = datePicker.findPreset('近 30 天');
    environment.sendDocumentClick(near30DaysPreset);
    near30DaysPreset.click();
    assert.equal(datePicker.trigger.textContent, '近 30 天');

    environment.runMutationObservers();
    await flushMicrotasks();

    assert.equal(datePicker.trigger.textContent, '近 30 天');
    assert.deepEqual(
      JSON.parse(JSON.stringify(environment.getStoredValue(getScopedStorageKey(origin, storageName)))),
      { type: 'preset', label: '近 30 天' },
    );
    datePicker.open();
    assert.ok(datePicker.findPreset('近 30 天')?.classList.contains('date-picker-preset-active'));
    assert.equal(datePicker.findPreset('今天')?.classList.contains('date-picker-preset-active'), false);
  });
}

test('excluded origin stays completely silent without injecting DOM or registering watchers', async () => {
  const origin = 'https://modded-sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      'sub2api-helper:global:excluded-origins': [origin],
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(environment.findSettingsLauncherButton(), null);
  assert.equal(environment.findAutoRefreshButton(), null);
  assert.equal(environment.findSettingsRoot(), null);
  assert.equal(environment.vmContext.document.documentElement.dataset.sub2apiHelperVersion, undefined);
});

test('bypasses usage request rewriting when origin is in excluded list', async () => {
  const origin = 'https://modded-sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      'sub2api-helper:global:excluded-origins': [origin],
      [getScopedStorageKey(origin, 'usage-date-range')]: {
        end_time: '2026-05-02T23:59:59+08:00',
        label: '自选',
        start_time: '2026-05-01T00:00:00+08:00',
        type: 'custom',
      },
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  await environment.vmContext.fetch('/api/v1/usage?start_time=raw_start&end_time=raw_end');
  const calls = environment.getFetchCalls();
  const lastCall = calls[calls.length - 1];
  assert.equal(lastCall.url, '/api/v1/usage?start_time=raw_start&end_time=raw_end');
});

test('registers menu commands to toggle origin exclusion and reload page', async () => {
  const origin = 'https://sub2api.example.test';
  const environment = createTestEnvironment({
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const excludeCommand = environment.getMenuCommand(`🚫 排除当前网站 (${origin})`);
  assert.equal(typeof excludeCommand, 'function');

  excludeCommand();
  assert.equal(environment.location.reloadCount, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(environment.getStoredValue('sub2api-helper:global:excluded-origins'))),
    [origin],
  );

  const excludedEnv = createTestEnvironment({
    gmValues: {
      'sub2api-helper:global:excluded-origins': [origin],
    },
    origin,
    pathname: '/usage',
  });
  vm.runInContext(source, excludedEnv.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  const restoreCommand = excludedEnv.getMenuCommand(`✅ 恢复在此网站启用 (${origin})`);
  assert.equal(typeof restoreCommand, 'function');

  restoreCommand();
  assert.equal(excludedEnv.location.reloadCount, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(excludedEnv.getStoredValue('sub2api-helper:global:excluded-origins'))),
    [],
  );
});

test('settings panel displays site exclusion switch and manages excluded origins list', async () => {
  const origin = 'https://sub2api.example.test';
  const otherOrigin = 'https://other-broken.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      'sub2api-helper:global:excluded-origins': [otherOrigin],
    },
    origin,
    pathname: '/usage',
  });
  createUsageFingerprint(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  assert.ok(settingsRoot);

  const siteSwitch = settingsRoot.querySelector('input[data-sub2api-site-exclusion-switch="true"]');
  assert.ok(siteSwitch);
  assert.equal(siteSwitch.checked, true);

  const excludedRow = settingsRoot.querySelector('[data-sub2api-excluded-origins-row="true"]');
  assert.ok(excludedRow);
  assert.match(excludedRow.textContent, /已排除网站 \(1\)/);
  assert.match(excludedRow.textContent, new RegExp(otherOrigin));

  const removeBtn = settingsRoot.querySelector(`button[data-sub2api-remove-excluded-origin="${otherOrigin}"]`);
  assert.ok(removeBtn);
  removeBtn.click();
  await flushMicrotasks();

  assert.deepEqual(
    JSON.parse(JSON.stringify(environment.getStoredValue('sub2api-helper:global:excluded-origins'))),
    [],
  );

  siteSwitch.checked = false;
  siteSwitch.dispatchEvent({ type: 'change' });
  assert.equal(environment.location.reloadCount, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(environment.getStoredValue('sub2api-helper:global:excluded-origins'))),
    [origin],
  );
});

function createAdminAccountUsageRow(environment, { accountId, accountName, homepage = false }) {
  const table = environment.document.createElement('table');
  const tbody = environment.document.createElement('tbody');
  const row = environment.document.createElement('tr');
  row.setAttribute('data-row-id', String(accountId));

  const selectCell = environment.document.createElement('td');
  const nameCell = environment.document.createElement('td');
  const nameStack = environment.document.createElement('div');
  nameStack.className = 'flex flex-col';

  const name = environment.document.createElement(homepage ? 'a' : 'span');
  name.className = 'font-medium text-gray-900 dark:text-white';
  if (homepage) {
    name.setAttribute('href', 'https://example.test/account');
  }
  name.textContent = accountName;

  let tooltipRoot = null;
  if (homepage) {
    tooltipRoot = environment.document.createElement('div');
    tooltipRoot.className = 'group relative ml-1 inline-flex items-center align-middle';
    tooltipRoot.appendChild(name);
    nameStack.appendChild(tooltipRoot);
  } else {
    nameStack.appendChild(name);
  }

  nameCell.appendChild(nameStack);
  row.appendChild(selectCell);
  row.appendChild(nameCell);
  tbody.appendChild(row);
  table.appendChild(tbody);
  environment.document.body.appendChild(table);

  return { name, nameCell, nameStack, row, table, tooltipRoot };
}

function createAccountUsageFilter(environment, {
  accountId,
  accountName,
  showResult = true,
  resultId = accountId,
  portalResult = false,
}) {
  const page = environment.document.createElement('div');
  page.className = 'space-y-6';

  const container = environment.document.createElement('div');
  container.className = 'usage-filter-dropdown relative w-full';

  const label = environment.document.createElement('label');
  label.className = 'input-label';
  label.textContent = '账户';

  const input = environment.document.createElement('input');
  input.setAttribute('placeholder', '按名称搜索账号...');

  container.appendChild(label);
  container.appendChild(input);
  page.appendChild(container);
  environment.document.body.appendChild(page);

  const state = { inputEvents: 0, selected: false };

  input.addEventListener('input', () => {
    state.inputEvents += 1;
    if (!showResult) {
      return;
    }
    if (container.querySelector('button[aria-label="Clear account filter"]')) {
      return;
    }
    if (container.querySelector(`[data-test-account-result="${resultId}"]`)) {
      return;
    }

    const dropdown = environment.document.createElement('div');
    dropdown.setAttribute('data-test-account-dropdown', 'true');

    const result = environment.document.createElement('button');
    result.setAttribute('data-test-account-result', String(resultId));
    result.textContent = `${accountName} #${resultId}`;
    result.addEventListener('click', () => {
      state.selected = true;
      input.value = accountName;

      const clear = environment.document.createElement('button');
      clear.setAttribute('aria-label', 'Clear account filter');
      clear.textContent = '✕';
      container.appendChild(clear);
      dropdown.remove();
    });

    dropdown.appendChild(result);
    (portalResult ? environment.document.body : container).appendChild(dropdown);
  });

  return { container, input, page, state };
}

test('admin accounts adds an idempotent usage shortcut to each account row', async () => {
  const origin = 'https://account-usage-shortcut.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  const first = createAdminAccountUsageRow(environment, { accountId: 42, accountName: 'Account A' });
  const second = createAdminAccountUsageRow(environment, { accountId: 7, accountName: 'Account B' });
  const third = createAdminAccountUsageRow(environment, {
    accountId: 9,
    accountName: 'Account C',
    homepage: true,
  });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const firstLink = first.row.querySelector('[data-sub2api-account-usage-link="true"]');
  assert.ok(firstLink);
  assert.equal(firstLink.parentElement, first.nameStack);
  assert.equal(firstLink.getAttribute('href'), '/admin/usage?account_id=42');
  assert.equal(firstLink.getAttribute('target'), '_blank');
  assert.equal(firstLink.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(firstLink.getAttribute('title'), '查看该账号的使用记录');
  assert.equal(firstLink.getAttribute('aria-label'), '查看该账号的使用记录');
  assert.equal(firstLink.style.position, 'absolute');
  assert.equal(firstLink.style.width, '1em');
  assert.equal(firstLink.style.height, '1em');
  assert.equal(first.nameStack.style.paddingLeft, '1.6em');
  assert.equal(first.nameStack.style.position, 'relative');
  assert.equal(first.name.querySelector('[data-sub2api-account-usage-link="true"]'), null);

  const secondLink = second.row.querySelector('[data-sub2api-account-usage-link="true"]');
  assert.ok(secondLink);
  assert.equal(secondLink.parentElement, second.nameStack);
  assert.equal(secondLink.getAttribute('href'), '/admin/usage?account_id=7');

  const thirdLink = third.row.querySelector('[data-sub2api-account-usage-link="true"]');
  assert.ok(thirdLink);
  assert.equal(thirdLink.parentElement, third.nameStack);
  assert.equal(third.name.querySelectorAll('a').length, 0);
  assert.equal(third.name.querySelector('[data-sub2api-account-usage-link="true"]'), null);

  environment.runMutationObservers();
  await flushMicrotasks(200);
  assert.equal(first.row.querySelectorAll('[data-sub2api-account-usage-link="true"]').length, 1);
  assert.equal(second.row.querySelectorAll('[data-sub2api-account-usage-link="true"]').length, 1);

  first.row.setAttribute('data-row-id', '43');
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const updatedLink = first.row.querySelector('[data-sub2api-account-usage-link="true"]');
  assert.ok(updatedLink);
  assert.equal(updatedLink.getAttribute('href'), '/admin/usage?account_id=43');
  assert.equal(first.row.querySelectorAll('[data-sub2api-account-usage-link="true"]').length, 1);
});

test('admin accounts usage shortcut honors the global feature switch', async () => {
  const origin = 'https://account-usage-shortcut-disabled.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('admin-accounts-usage-link')]: false,
    },
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  const account = createAdminAccountUsageRow(environment, { accountId: 42, accountName: 'Account A' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  assert.equal(account.row.querySelector('[data-sub2api-account-usage-link="true"]'), null);
  assert.equal(account.nameStack.getAttribute('data-sub2api-account-usage-gutter'), null);
  assert.equal(account.nameStack.style.paddingLeft, undefined);

  environment.getMenuCommand('Sub2API Helper 设置')();
  const accountsGroup = environment
    .findSettingsRoot()
    .querySelector('section[data-sub2api-settings-group="admin-accounts"]');
  assert.ok(accountsGroup);
  assert.ok(
    accountsGroup.querySelector('input[data-sub2api-feature-global-switch="admin-accounts-usage-link"]'),
  );
});

test('admin usage deep link backfills the native account filter', async () => {
  const origin = 'https://account-usage-deeplink.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, { accountId: 42, accountName: 'Account A' });
  environment.setFetchResponse('/api/v1/admin/accounts/42', {
    code: 0,
    data: { id: 42, name: 'Account A' },
  });
  environment.vmContext.localStorage.setItem('auth_token', 'test-token');
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  assert.equal(filter.input.value, 'Account A');
  assert.equal(filter.state.selected, true);
  assert.ok(filter.container.querySelector('button[aria-label="Clear account filter"]'));
  assert.equal(filter.page.querySelector('[data-sub2api-account-usage-notice="true"]'), null);

  const accountCalls = environment.getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/accounts/42'));
  assert.deepEqual(accountCalls.map((call) => call.url), [`${origin}/api/v1/admin/accounts/42`]);
  assert.equal(accountCalls[0].headers.Authorization, 'Bearer test-token');
  assert.equal(accountCalls[0].headers['X-Admin-UI-Request'], '1');
});

test('admin usage deep link finds a dropdown result rendered outside the filter container', async () => {
  const origin = 'https://account-usage-deeplink-portal.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, {
    accountId: 42,
    accountName: 'Account A',
    portalResult: true,
  });
  environment.setFetchResponse('/api/v1/admin/accounts/42', {
    code: 0,
    data: { id: 42, name: 'Account A' },
  });
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  assert.equal(filter.input.value, 'Account A');
  assert.equal(filter.state.selected, true);
  assert.ok(filter.container.querySelector('button[aria-label="Clear account filter"]'));
  assert.equal(filter.page.querySelector('[data-sub2api-account-usage-notice="true"]'), null);
});

test('admin usage deep link falls back to a unique matching account name', async () => {
  const origin = 'https://account-usage-deeplink-name-fallback.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, {
    accountId: 42,
    accountName: 'Account A',
    resultId: 99,
  });
  environment.setFetchResponse('/api/v1/admin/accounts/42', {
    code: 0,
    data: { id: 42, name: 'Account A' },
  });
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  assert.equal(filter.input.value, 'Account A');
  assert.equal(filter.state.selected, true);
  assert.ok(filter.container.querySelector('button[aria-label="Clear account filter"]'));
  assert.equal(filter.page.querySelector('[data-sub2api-account-usage-notice="true"]'), null);
});

test('admin usage deep link shows a retry notice when the account cannot be selected', async () => {
  const origin = 'https://account-usage-deeplink-fail.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, {
    accountId: 42,
    accountName: 'Account A',
    showResult: false,
  });
  environment.setFetchResponse('/api/v1/admin/accounts/42', {
    code: 0,
    data: { id: 42, name: 'Account A' },
  });
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(500);

  const notice = filter.page.querySelector('[data-sub2api-account-usage-notice="true"]');
  assert.ok(notice);
  assert.match(notice.textContent, /Account A/);
  assert.match(notice.textContent, /#42/);
  assert.match(notice.textContent, /未能自动选中账号/);
  assert.equal(filter.input.value, 'Account A');

  const buttons = notice.querySelectorAll('button');
  const retryButton = buttons.find((button) => button.textContent.trim() === '重试');
  const closeButton = buttons.find((button) => button.textContent.trim() === '关闭');
  assert.ok(retryButton);
  assert.ok(closeButton);

  closeButton.click();
  assert.equal(filter.page.querySelector('[data-sub2api-account-usage-notice="true"]'), null);
});

test('admin usage deep link shows a non-retry notice when the account is missing', async () => {
  const origin = 'https://account-usage-deeplink-missing.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/usage' });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, { accountId: 42, accountName: 'Account A' });
  environment.setFetchResponse('/api/v1/admin/accounts/42', { code: 0, data: null });
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  const notice = filter.page.querySelector('[data-sub2api-account-usage-notice="true"]');
  assert.ok(notice);
  assert.match(notice.textContent, /无法读取账号/);
  assert.match(notice.textContent, /#42/);

  const buttons = notice.querySelectorAll('button');
  assert.equal(buttons.some((button) => button.textContent.trim() === '重试'), false);
  assert.ok(buttons.some((button) => button.textContent.trim() === '关闭'));
});

test('admin usage deep link is ignored when the shortcut feature is disabled', async () => {
  const origin = 'https://account-usage-deeplink-disabled.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('admin-accounts-usage-link')]: false,
    },
    origin,
    pathname: '/admin/usage',
  });
  createUsageFingerprint(environment);
  const filter = createAccountUsageFilter(environment, { accountId: 42, accountName: 'Account A' });
  environment.setFetchResponse('/api/v1/admin/accounts/42', {
    code: 0,
    data: { id: 42, name: 'Account A' },
  });
  environment.location.href = `${origin}/admin/usage?account_id=42`;

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  assert.equal(filter.input.value, '');
  assert.equal(filter.state.selected, false);
  assert.equal(
    environment.getFetchCalls().some((call) => call.url.includes('/api/v1/admin/accounts/42')),
    false,
  );
  assert.equal(filter.page.querySelector('[data-sub2api-account-usage-notice="true"]'), null);
});

function buildAccountHitRateStatsResponse({
  inputTokens = 0,
  outputTokens = 0,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
} = {}) {
  return {
    code: 0,
    data: {
      average_duration_ms: 0,
      total_actual_cost: 0,
      total_cache_creation_tokens: cacheCreationTokens,
      total_cache_read_tokens: cacheReadTokens,
      total_cache_tokens: cacheCreationTokens + cacheReadTokens,
      total_cost: 0,
      total_input_tokens: inputTokens,
      total_output_tokens: outputTokens,
      total_requests: 1,
      total_tokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    },
  };
}

function readTrackedAccountIds(environment, origin) {
  const raw = environment.getStoredValue(
    getScopedStorageKey(origin, 'admin-accounts-hit-rate-tracked'),
  );
  return Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)).map(Number) : [];
}

test('admin accounts renders a cache hit rate badge and derived percentage', async () => {
  const origin = 'https://account-hit-rate.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 42, accountName: 'Account A' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({
      cacheCreationTokens: 0,
      cacheReadTokens: 900,
      inputTokens: 100,
      outputTokens: 50,
    }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const badge = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  assert.ok(badge, 'hit rate badge should be injected next to the usage shortcut');
  assert.equal(badge.textContent, '–');

  badge.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  const statsCalls = environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats'));
  assert.equal(statsCalls.length, 1);
  const requestUrl = new URL(statsCalls[0].url);
  assert.equal(requestUrl.searchParams.get('account_id'), '42');
  assert.equal(requestUrl.searchParams.get('start_date'), requestUrl.searchParams.get('end_date'));
  assert.equal(statsCalls[0].headers.Authorization, undefined);
  assert.equal(statsCalls[0].headers['X-Admin-UI-Request'], '1');

  const rendered = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  assert.equal(rendered.textContent, '90%');
  assert.match(rendered.className, /text-emerald-600/);
});

test('admin accounts hit rate uses yesterday when the saved range is yesterday', async () => {
  const origin = 'https://account-hit-rate-yesterday.sub2api.example.test';
  const now = RealDate.parse('2026-05-09T12:00:00+08:00');
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-hit-rate-range')]: 'yesterday',
    },
    now,
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 7, accountName: 'Account B' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ cacheReadTokens: 10, inputTokens: 90 }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const badge = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  assert.ok(badge);
  badge.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  const call = environment
    .getFetchCalls()
    .find((entry) => entry.url.includes('/api/v1/admin/usage/stats'));
  const requestUrl = new URL(call.url);
  assert.equal(requestUrl.searchParams.get('start_date'), '2026-05-08');
  assert.equal(requestUrl.searchParams.get('end_date'), '2026-05-08');
});

test('admin accounts hit rate renders a dash when the range has no prompt tokens', async () => {
  const origin = 'https://account-hit-rate-empty.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 11, accountName: 'Account C' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ outputTokens: 500 }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const badge = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  badge.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  const rendered = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  assert.equal(rendered.textContent, '–');
  assert.match(rendered.getAttribute('title'), /没有 Prompt Token/);
});

test('admin accounts hit rate degrades to a dash on a failed response', async () => {
  const origin = 'https://account-hit-rate-error.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 12, accountName: 'Account D' });
  environment.setFetchStatus('/api/v1/admin/usage/stats', 500);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const badge = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  badge.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  const rendered = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
  assert.equal(rendered.textContent, '–');
  assert.match(rendered.getAttribute('title'), /查询失败/);
});

test('admin accounts hit rate tracking persists and is capped', async () => {
  const origin = 'https://account-hit-rate-track.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 21, accountName: 'Account E' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ cacheReadTokens: 50, inputTokens: 50 }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const toggle = account.row.querySelector('[data-sub2api-account-hit-rate-track="true"]');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');

  toggle.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  assert.deepEqual(readTrackedAccountIds(environment, origin), [21]);
  const trackedToggle = account.row.querySelector('[data-sub2api-account-hit-rate-track="true"]');
  assert.equal(trackedToggle.getAttribute('aria-pressed'), 'true');

  trackedToggle.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);
  assert.deepEqual(readTrackedAccountIds(environment, origin), []);
});

test('admin accounts hit rate ignores tracked ids beyond the configured cap', async () => {
  const origin = 'https://account-hit-rate-cap.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 99, accountName: 'Account F' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  const toggle = account.row.querySelector('[data-sub2api-account-hit-rate-track="true"]');
  toggle.dispatchEvent({ type: 'click' });
  await flushMicrotasks(200);

  const stored = readTrackedAccountIds(environment, origin);
  assert.deepEqual(stored, [99]);
});

test('admin accounts hit rate feature switch removes the injected controls', async () => {
  const origin = 'https://account-hit-rate-switch.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getGlobalFeatureStorageKey('admin-accounts-hit-rate')]: false,
    },
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  const account = createAdminAccountUsageRow(environment, { accountId: 31, accountName: 'Account G' });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);
  environment.runMutationObservers();
  await flushMicrotasks(200);

  assert.equal(account.row.querySelector('[data-sub2api-account-hit-rate="true"]'), null);
  assert.equal(account.row.querySelector('[data-sub2api-account-hit-rate-track="true"]'), null);
});

test('admin accounts hit rate settings row normalizes the interval input', async () => {
  const origin = 'https://account-hit-rate-settings.sub2api.example.test';
  const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(200);

  environment.getMenuCommand('Sub2API Helper 设置')();
  const settingsRoot = environment.findSettingsRoot();
  assert.ok(settingsRoot);

  const row = settingsRoot.querySelector('[data-sub2api-account-hit-rate-settings-row="true"]');
  assert.ok(row);
  assert.match(row.textContent, /已监控 0\/10 个账号/);

  const input = row.querySelector('[data-sub2api-account-hit-rate-interval-input="true"]');
  assert.equal(input.value, '30');

  input.value = '5';
  input.dispatchEvent({ type: 'change' });
  assert.equal(input.value, '30');
  assert.equal(
    environment.getStoredValue(
      getScopedStorageKey(origin, 'admin-accounts-hit-rate-interval'),
    ),
    30,
  );

  input.value = '120';
  input.dispatchEvent({ type: 'change' });
  assert.equal(input.value, '120');
  assert.equal(
    environment.getStoredValue(
      getScopedStorageKey(origin, 'admin-accounts-hit-rate-interval'),
    ),
    120,
  );
});

test('admin accounts hit rate maps severity bands to the shared palette', async () => {
  const cases = [
    { expectedClass: 'text-emerald-600', cache: { cacheReadTokens: 95, inputTokens: 5 } },
    { expectedClass: 'text-amber-600', cache: { cacheReadTokens: 85, inputTokens: 15 } },
    { expectedClass: 'text-orange-600', cache: { cacheReadTokens: 65, inputTokens: 35 } },
    { expectedClass: 'text-red-600', cache: { cacheReadTokens: 40, inputTokens: 60 } },
  ];

  for (const [index, testCase] of cases.entries()) {
    const origin = `https://account-hit-rate-band-${index}.sub2api.example.test`;
    const environment = createTestEnvironment({ origin, pathname: '/admin/accounts' });
    environment.createSidebarToggle({ collapsed: false });
    createAdminAccountsFilters(environment);
    const account = createAdminAccountUsageRow(environment, { accountId: 40 + index, accountName: `Band ${index}` });
    environment.setFetchResponse(
      '/api/v1/admin/usage/stats',
      buildAccountHitRateStatsResponse(testCase.cache),
    );

    vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
    await flushMicrotasks(200);
    environment.runMutationObservers();
    await flushMicrotasks(200);

    const badge = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
    badge.dispatchEvent({ type: 'click' });
    await flushMicrotasks(200);

    const rendered = account.row.querySelector('[data-sub2api-account-hit-rate="true"]');
    assert.match(rendered.className, new RegExp(testCase.expectedClass));
  }
});

test('admin accounts hit rate pauses after three consecutive failures and can resume', async () => {
  const origin = 'https://account-hit-rate-breaker.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-hit-rate-tracked')]: [51, 52, 53],
    },
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  createAdminAccountUsageRow(environment, { accountId: 51, accountName: 'Tracked A' });
  createAdminAccountUsageRow(environment, { accountId: 52, accountName: 'Tracked B' });
  createAdminAccountUsageRow(environment, { accountId: 53, accountName: 'Tracked C' });
  environment.setFetchStatus('/api/v1/admin/usage/stats', 500);

  const pageRoot = environment.document.createElement('div');
  pageRoot.className = 'space-y-6';
  environment.document.body.appendChild(pageRoot);

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(400);

  const statsCalls = environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats'));
  assert.equal(statsCalls.length, 3);

  const notice = pageRoot.querySelector('[data-sub2api-account-hit-rate-notice="true"]');
  assert.ok(notice, 'breaker notice should be rendered after repeated failures');
  assert.match(notice.textContent, /已暂停/);

  const resume = notice.querySelector('[data-sub2api-account-hit-rate-notice-resume="true"]');
  assert.ok(resume);
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ cacheReadTokens: 70, inputTokens: 30 }),
  );
  environment.setFetchStatus('/api/v1/admin/usage/stats', 200);
  resume.dispatchEvent({ type: 'click' });
  await flushMicrotasks(400);

  const callsAfterResume = environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats'));
  assert.ok(callsAfterResume.length > 3);
});

test('admin accounts hit rate does not sweep while the page is hidden', async () => {
  const origin = 'https://account-hit-rate-hidden.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-hit-rate-tracked')]: [61],
    },
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  createAdminAccountUsageRow(environment, { accountId: 61, accountName: 'Tracked Hidden' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ cacheReadTokens: 80, inputTokens: 20 }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(400);

  const initialCalls = environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats')).length;
  assert.equal(initialCalls, 1);

  environment.setVisibilityState('hidden');
  await flushMicrotasks(200);

  for (const { handler } of environment.intervals.values()) {
    handler();
  }
  await flushMicrotasks(300);

  const hiddenCalls = environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats')).length;
  assert.equal(hiddenCalls, initialCalls);
});

test('admin accounts hit rate does not restart a cycle on repeated injections', async () => {
  const origin = 'https://account-hit-rate-idempotent.sub2api.example.test';
  const environment = createTestEnvironment({
    gmValues: {
      [getScopedStorageKey(origin, 'admin-accounts-hit-rate-tracked')]: [71],
    },
    origin,
    pathname: '/admin/accounts',
  });
  environment.createSidebarToggle({ collapsed: false });
  createAdminAccountsFilters(environment);
  createAdminAccountUsageRow(environment, { accountId: 71, accountName: 'Tracked Idempotent' });
  environment.setFetchResponse(
    '/api/v1/admin/usage/stats',
    buildAccountHitRateStatsResponse({ cacheReadTokens: 60, inputTokens: 40 }),
  );

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks(400);

  const countCalls = () => environment
    .getFetchCalls()
    .filter((call) => call.url.includes('/api/v1/admin/usage/stats')).length;

  const baseline = countCalls();
  assert.equal(baseline, 1);

  for (let round = 0; round < 3; round += 1) {
    environment.runMutationObservers();
    await flushMicrotasks(200);
  }

  assert.equal(countCalls(), baseline);
});
