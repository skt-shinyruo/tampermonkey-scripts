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
  origin = 'https://codex.ciii.club',
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
      toggle.addEventListener('click', () => {
        toggle.clickCount += 1;
        syncState(toggle.getAttribute('title') !== '展开');
      });
      syncState(collapsed);

      sidebar.appendChild(nav);
      sidebar.appendChild(toggle);
      body.appendChild(sidebar);
      return { sidebar, toggle };
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
  const { sidebar } = environment.createSidebar({ collapsed: true });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
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
  const { sidebar } = environment.createSidebar({ collapsed: false });

  vm.runInContext(source, environment.vmContext, { filename: builtScriptPath });
  await flushMicrotasks();

  assert.equal(sidebar.dataset.sub2apiSidebarWidthApplied, undefined);
  assert.equal(sidebar.style.getPropertyValue('--sub2api-helper-sidebar-width'), '');
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

test('metadata targets generic Sub2API deployments instead of one Ciii domain', () => {
  assert.match(source, /\/\/ @name\s+Sub2API Helper/);
  assert.match(source, /\/\/ @namespace\s+https:\/\/github\.com\/skt-shinyruo\/tampermonkey-scripts/);
  assert.match(source, /\/\/ @match\s+\*:\/\/\*\/\*/);
  assert.match(source, /\/\/ @grant\s+GM_registerMenuCommand/);
  assert.match(source, /\/\/ @run-at\s+document-start/);
  assert.doesNotMatch(source, /\/\/ @match\s+https:\/\/codex\.ciii\.club\/\*/);
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
  const origin = 'https://codex.ciii.club';
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
  const origin = 'https://codex.ciii.club';
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
