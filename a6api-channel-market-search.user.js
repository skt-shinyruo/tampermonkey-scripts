// ==UserScript==
// @name         A6API 渠道名称 → 市场自动搜索
// @namespace    https://a6api.com/
// @version      1.4.18
// @description  在渠道管理页提供查市场/后台查快捷按钮并自动同步渠道；在市场页提供快捷渠道抽屉面板，支持一键切换搜索渠道与自定义渠道管理
// @match        https://a6api.com/*
// @updateURL    https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js
// @downloadURL  https://raw.githubusercontent.com/skt-shinyruo/tampermonkey-scripts/build/a6api-channel-market-search.user.js
// @grant        GM_openInTab
// @grant        GM.openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var MARKET_BASE = 'https://a6api.com/';
  var STORAGE_KEY_OWNED = 'a6_owned_channels';
  var STORAGE_KEY_CUSTOM = 'a6_custom_channels';
  var STORAGE_KEY_REMARKS = 'a6_channel_remarks';
  var STORAGE_KEY_DRAWER_OPEN = 'a6_drawer_open';
  var STORAGE_KEY_DRAWER_SIDE = 'a6_drawer_side';
  var STORAGE_KEY_MARKET_WIDTH = 'a6_market_width';
  var STORAGE_KEY_AUTO_LOAD = 'a6_auto_load_more';
  /* ================= 通用本地存储 (GM API 优先，localStorage 兜底) ================= */

  function storageGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        var v = GM_getValue(key);
        if (v !== undefined && v !== null) {
          if (typeof v === 'string') {
            try {
              return JSON.parse(v);
            } catch (e) {
              return v;
            }
          }
          return v;
        }
      }
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var raw = localStorage.getItem(key);
        if (raw !== null && raw !== undefined) {
          try {
            return JSON.parse(raw);
          } catch (e) {
            return raw;
          }
        }
      }
    } catch (e) {}
    return fallback;
  }

  function storageSet(key, val) {
    var payload = JSON.stringify(val);
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, payload);
        return;
      }
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, payload);
      }
    } catch (e) {}
  }

  function getChannelRemark(id) {
    if (!id) return '';
    var remarks = storageGet(STORAGE_KEY_REMARKS, {});
    return remarks[String(id)] || '';
  }

  function setChannelRemark(id, remark) {
    if (!id) return;
    var remarks = storageGet(STORAGE_KEY_REMARKS, {});
    if (remark && remark.trim()) {
      remarks[String(id)] = remark.trim();
    } else {
      delete remarks[String(id)];
    }
    storageSet(STORAGE_KEY_REMARKS, remarks);
  }

  function isAnonymizedPlaceholder(name) {
    if (!name || typeof name !== 'string') return false;
    var trimmed = name.trim();
    return /^(?:Channel|Supplier)\s*(?:ID|#)?\s*\d+$/i.test(trimmed) || /^#?\d+$/.test(trimmed);
  }

  function getApiUserId() {
    var storages = [];
    try {
      if (typeof localStorage !== 'undefined' && localStorage) storages.push(localStorage);
    } catch (e) {}
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) storages.push(sessionStorage);
    } catch (e) {}
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
        if (unsafeWindow.localStorage && storages.indexOf(unsafeWindow.localStorage) === -1) storages.push(unsafeWindow.localStorage);
        if (unsafeWindow.sessionStorage && storages.indexOf(unsafeWindow.sessionStorage) === -1) storages.push(unsafeWindow.sessionStorage);
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window) {
        if (window.localStorage && storages.indexOf(window.localStorage) === -1) storages.push(window.localStorage);
        if (window.sessionStorage && storages.indexOf(window.sessionStorage) === -1) storages.push(window.sessionStorage);
      }
    } catch (e) {}

    for (var i = 0; i < storages.length; i++) {
      var st = storages[i];
      try {
        var raw = st.getItem('a6api_session_user_id');
        if (raw && /^\d+$/.test(String(raw).trim())) {
          return String(raw).trim();
        }
        var userRaw = st.getItem('user');
        if (userRaw) {
          var parsed = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
          if (parsed && (parsed.id || parsed.user_id)) {
            var uid = String(parsed.id || parsed.user_id).trim();
            if (/^\d+$/.test(uid)) return uid;
          }
        }
      } catch (e) {}
    }
    return '';
  }

  function resolveApiUserId(fetchFn, callback) {
    var uid = getApiUserId();
    if (uid) return callback(uid);

    try {
      var p = fetchFn('/api/user/session', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!p || typeof p.then !== 'function') return callback('');
      p.then(function (res) {
        if (!res || !res.ok) return callback('');
        return res.json().then(function (json) {
          var raw = json && json.data !== undefined ? json.data : json;
          var foundId = raw && (raw.id || raw.user_id) ? String(raw.id || raw.user_id).trim() : '';
          if (foundId && /^\d+$/.test(foundId)) {
            try {
              if (typeof localStorage !== 'undefined' && localStorage) {
                localStorage.setItem('a6api_session_user_id', foundId);
              }
            } catch (e) {}
            return callback(foundId);
          }
          callback('');
        });
      }).catch(function () {
        callback('');
      });
    } catch (e) {
      callback('');
    }
  }

  function fetchOwnedChannelsFromApi(callback) {
    var fetchFn = typeof fetch === 'function' ? fetch : (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch : null);
    if (!fetchFn) return callback(null, 'no_fetch');

    resolveApiUserId(fetchFn, function (userId) {
      var headers = {
        Accept: 'application/json',
      };
      if (userId) {
        headers['New-Api-User'] = String(userId);
      }

      function doRequest(endpoint, onDone) {
        try {
          var p = fetchFn(endpoint, {
            credentials: 'include',
            headers: headers,
          });
          if (!p || typeof p.then !== 'function') return onDone(null, 'no_promise');
          p.then(function (res) {
            if (!res) throw new Error('No response');
            if (res.status === 401 || res.status === 403) {
              return onDone(null, 'unauthorized');
            }
            if (res.status === 404) {
              return onDone(null, 'not_found');
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json().then(function (json) {
              if (json && (json.code === 'dashboard_auth_required' || json.success === false)) {
                return onDone(null, 'unauthorized');
              }
              var raw = json;
              if (raw && raw.data !== undefined) raw = raw.data;
              var list = [];
              if (Array.isArray(raw)) {
                list = raw;
              } else if (raw && Array.isArray(raw.items)) {
                list = raw.items;
              }
              var channels = [];
              for (var i = 0; i < list.length; i++) {
                var item = list[i] || {};
                var ch = item.channel || item;
                var cid = String(ch.id !== undefined && ch.id !== null ? ch.id : (ch.channel_id !== undefined ? ch.channel_id : '')).trim();
                if (!cid) continue;
                var cname = (ch.name || '').trim();
                var cdesc = (ch.description || ch.desc || '').trim();
                var isDelisted = Number(ch.status) !== 1;
                channels.push({
                  id: cid,
                  name: cname,
                  desc: cdesc,
                  delisted: isDelisted,
                });
              }
              onDone(channels, null);
            });
          }).catch(function (err) {
            onDone(null, err || 'error');
          });
        } catch (e) {
          onDone(null, e);
        }
      }

      doRequest('/api/supplier/me/channels', function (channels, err) {
        if (err === 'not_found') {
          doRequest('/api/supplier/me/channels/page?page=1&size=100', callback);
        } else {
          callback(channels, err);
        }
      });
    });
  }

  function syncOwnedChannelsFromApi(callback) {
    fetchOwnedChannelsFromApi(function (channels, err) {
      if (err || !channels) {
        return callback({ ok: false, error: err, count: 0, total: 0 });
      }
      var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
      var changed = false;
      var updated = 0;
      for (var i = 0; i < channels.length; i++) {
        var ch = channels[i];
        var existing = ownedMap[ch.id];
        var name = ch.name || (existing ? existing.name : '') || ch.id;
        if (ch.name && (!existing || existing.name !== ch.name || isAnonymizedPlaceholder(existing.name))) {
          name = ch.name;
        }
        var desc = ch.desc !== undefined ? ch.desc : (existing ? existing.desc : '');
        var delisted = !!ch.delisted;
        if (!existing || existing.name !== name || existing.desc !== desc || existing.delisted !== delisted) {
          ownedMap[ch.id] = {
            id: ch.id,
            name: name,
            desc: desc,
            delisted: delisted,
            updatedAt: Date.now(),
          };
          changed = true;
          updated++;
        }
      }
      if (changed) {
        storageSet(STORAGE_KEY_OWNED, ownedMap);
      }
      callback({ ok: true, count: updated, total: channels.length });
    });
  }

  function fetchChannelInfoFromApi(cid, callback) {
    var fetchFn = typeof fetch === 'function' ? fetch : (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch : null);
    if (!fetchFn) {
      return callback(null);
    }
    var apiUrl = '/api/marketplace/public/channels/search?channel_id=' + encodeURIComponent(cid);
    try {
      var p = fetchFn(apiUrl, { credentials: 'include' });
      if (!p || typeof p.then !== 'function') return callback(null);
      p.then(function (res) {
        if (!res) throw new Error('No response');
        if (res.status === 404) {
          return { status: 404, items: [] };
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().then(function (json) {
          return { status: 200, json: json };
        });
      })
      .then(function (result) {
        if (!result) return callback(null);
        if (result.status === 404) {
          return callback({
            name: '',
            desc: '',
            delisted: true,
            isAnonymized: false,
            remark: getChannelRemark(cid),
          });
        }
        var json = result.json;
        var items = (json && json.data && Array.isArray(json.data.items)) ? json.data.items : [];
        if (items.length > 0) {
          var it = items[0];
          var rawName = (it.channel_name || it.supplier_nickname || it.supplier_name || '').trim();
          var isAnon = isAnonymizedPlaceholder(rawName);
          var modelFallback = it.model_name ? (it.model_name + ' 渠道') : '';
          var name = isAnon ? (modelFallback || rawName) : rawName;
          var desc = it.description || it.supplier_name || '';
          return callback({
            name: (name || '').trim(),
            desc: (desc || '').trim(),
            delisted: false,
            isAnonymized: isAnon,
            remark: getChannelRemark(cid),
          });
        } else {
          return callback({
            name: '',
            desc: '',
            delisted: true,
            isAnonymized: false,
            remark: getChannelRemark(cid),
          });
        }
      })
      .catch(function () {
        callback(null);
      });
    } catch (e) {
      callback(null);
    }
  }

  function fetchChannelInfoFromDom(targetId) {
    var rows = document.querySelectorAll('tbody tr, .market-row, [role="row"], .ant-table-row, [class*="table-row"]');
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k];
      var text = row.textContent || '';
      var cleanText = text.replace(/供应商\s*#?\s*\d+/g, '');
      var m = cleanText.match(/(?:渠道\s*#?|#)\s*(\d+)/);
      var rowCid = m ? m[1] : '';
      if (!rowCid && row.getAttribute) {
        rowCid = row.getAttribute('data-cid') || row.getAttribute('data-channel-id') || '';
      }
      if (rowCid === targetId) {
        var nameEl = row.querySelector('.model-name-text, [class*="model-name"], .sc-channel-name, .name, [class*="name"], .title, [class*="title"], h3, h4');
        var descEl = row.querySelector('.model-sub-desc, [class*="model-sub-desc"], .sc-channel-desc, .desc, [class*="desc"]');
        var foundName = nameEl ? (nameEl.textContent || '').trim() : '';
        var foundDesc = descEl ? (descEl.textContent || '').trim() : '';
        if (foundName || foundDesc) {
          return {
            name: foundName,
            desc: foundDesc,
            remark: getChannelRemark(targetId),
          };
        }
      }
    }
    return null;
  }

  function fetchChannelInfo(cid, cb) {
    if (!cid) return cb(null);
    var targetId = String(cid).trim();
    if (!targetId) return cb(null);

    // 1) 检查已同步的商户自有渠道缓存匹配（拥有权威真实名称）
    var owned = storageGet(STORAGE_KEY_OWNED, {});
    if (owned[targetId] && !isAnonymizedPlaceholder(owned[targetId].name)) {
      var item = owned[targetId];
      return cb({
        name: item.name || '',
        desc: item.desc || '',
        delisted: !!item.delisted,
        remark: getChannelRemark(targetId),
      });
    }

    // 2) 检查已有的自定义渠道与备注
    var custom = storageGet(STORAGE_KEY_CUSTOM, []);
    for (var i = 0; i < custom.length; i++) {
      if (String(custom[i].id) === targetId && !isAnonymizedPlaceholder(custom[i].name)) {
        return cb({
          name: custom[i].name || '',
          desc: custom[i].desc || '',
          delisted: !!custom[i].delisted,
          remark: getChannelRemark(targetId),
        });
      }
    }

    // 3) 优先通过官方市场公开检索接口精准获取
    fetchChannelInfoFromApi(targetId, function (apiInfo) {
      if (apiInfo && (apiInfo.name || apiInfo.desc)) {
        return cb(apiInfo);
      }

      // 4) 若 API 未命中或无网络环境，按行精准解析当前市场 DOM（杜绝卡片容器贪婪匹配）
      var domInfo = fetchChannelInfoFromDom(targetId);
      if (domInfo) {
        return cb(domInfo);
      }

      return cb({
        name: '',
        desc: '',
        delisted: apiInfo ? !!apiInfo.delisted : false,
        remark: getChannelRemark(targetId),
      });
    });
  }

  var CHANNEL_SYNC_TTL = 2 * 60 * 60 * 1000; // 2 hours

  function updateChannelMetadata(id, remoteInfo) {
    if (!id || !remoteInfo) return false;
    var targetId = String(id).trim();
    var changed = false;

    // 注意：我的渠道状态与真实名称严格由商户后台支配，公开市场检索绝不可标记下架或用占位符覆盖名称
    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    if (ownedMap[targetId]) {
      var ownedItem = ownedMap[targetId];
      if (!remoteInfo.delisted) {
        var isAnon = isAnonymizedPlaceholder(remoteInfo.name);
        var existingIsAnon = isAnonymizedPlaceholder(ownedItem.name);
        var newName = (!isAnon && remoteInfo.name) ? remoteInfo.name : ((existingIsAnon && remoteInfo.name) ? remoteInfo.name : ownedItem.name);
        var newDesc = remoteInfo.desc !== undefined && remoteInfo.desc !== '' ? remoteInfo.desc : ownedItem.desc;
        if (ownedItem.name !== newName || ownedItem.desc !== newDesc) {
          ownedItem.name = newName;
          ownedItem.desc = newDesc;
          ownedItem.updatedAt = Date.now();
          changed = true;
        }
      }
      if (changed) {
        storageSet(STORAGE_KEY_OWNED, ownedMap);
      }
    }

    var customList = storageGet(STORAGE_KEY_CUSTOM, []);
    var customChanged = false;
    for (var i = 0; i < customList.length; i++) {
      if (String(customList[i].id) === targetId) {
        var custItem = customList[i];
        if (remoteInfo.delisted) {
          if (!custItem.delisted) {
            custItem.delisted = true;
            custItem.updatedAt = Date.now();
            customChanged = true;
          }
        } else {
          var cIsAnon = isAnonymizedPlaceholder(remoteInfo.name);
          var cExistingIsAnon = isAnonymizedPlaceholder(custItem.name);
          var cNewName = custItem.name;
          if (!cIsAnon && remoteInfo.name) {
            cNewName = remoteInfo.name;
          } else if (cExistingIsAnon || !cNewName || cNewName === targetId) {
            cNewName = remoteInfo.name || targetId;
          }
          var cNewDesc = remoteInfo.desc !== undefined && remoteInfo.desc !== '' ? remoteInfo.desc : custItem.desc;
          if (custItem.name !== cNewName || custItem.desc !== cNewDesc || custItem.delisted) {
            custItem.name = cNewName;
            custItem.desc = cNewDesc;
            custItem.delisted = false;
            custItem.updatedAt = Date.now();
            customChanged = true;
          }
        }
      }
    }
    if (customChanged) {
      storageSet(STORAGE_KEY_CUSTOM, customList);
      changed = true;
    }

    return changed;
  }

  function syncAllChannels(callback) {
    var customList = storageGet(STORAGE_KEY_CUSTOM, []);
    var customIds = [];
    customList.forEach(function (c) {
      if (c && c.id && customIds.indexOf(String(c.id)) === -1) customIds.push(String(c.id));
    });

    // 双源同步：优先拉取商户中心接口修复与更新「我的渠道」
    syncOwnedChannelsFromApi(function (ownedResult) {
      var ownedUpdated = (ownedResult && ownedResult.ok) ? (ownedResult.count || 0) : 0;
      var authError = !!(ownedResult && ownedResult.error === 'unauthorized');

      if (customIds.length === 0) {
        if (callback) {
          callback({
            total: (ownedResult && ownedResult.total ? ownedResult.total : 0),
            updated: ownedUpdated,
            merchantOk: !!(ownedResult && ownedResult.ok),
            merchantAuthError: authError,
          });
        }
        return;
      }

      var idx = 0;
      var active = 0;
      var customUpdated = 0;
      var completed = 0;
      var concurrency = 3;

      function nextCustom() {
        while (active < concurrency && idx < customIds.length) {
          var cid = customIds[idx++];
          active++;
          (function (id) {
            fetchChannelInfoFromApi(id, function (remoteInfo) {
              active--;
              completed++;
              if (remoteInfo) {
                var changed = updateChannelMetadata(id, remoteInfo);
                if (changed) customUpdated++;
              }
              if (completed === customIds.length) {
                if (callback) {
                  callback({
                    total: (ownedResult && ownedResult.total ? ownedResult.total : 0) + customIds.length,
                    updated: ownedUpdated + customUpdated,
                    merchantOk: !!(ownedResult && ownedResult.ok),
                    merchantAuthError: authError,
                  });
                }
              } else {
                nextCustom();
              }
            });
          })(cid);
        }
      }
      nextCustom();
    });
  }

  function triggerPassiveSync(cid) {
    if (!cid) return;
    var targetId = String(cid).trim();
    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    var customList = storageGet(STORAGE_KEY_CUSTOM, []);

    if (ownedMap[targetId]) {
      var ownedItem = ownedMap[targetId];
      var needsRepair = isAnonymizedPlaceholder(ownedItem.name);
      var lastUpdated = ownedItem.updatedAt || 0;
      if (!needsRepair && (Date.now() - lastUpdated < CHANNEL_SYNC_TTL)) {
        return;
      }
      syncOwnedChannelsFromApi(function (res) {
        if (res && res.ok && res.count > 0) {
          renderMarketDrawer(true);
        }
      });
      return;
    }

    var targetItem = null;
    for (var i = 0; i < customList.length; i++) {
      if (String(customList[i].id) === targetId) {
        targetItem = customList[i];
        break;
      }
    }
    if (!targetItem) return;

    var lastUpdated = targetItem.updatedAt || 0;
    if (Date.now() - lastUpdated < CHANNEL_SYNC_TTL) {
      return;
    }

    fetchChannelInfoFromApi(targetId, function (remoteInfo) {
      if (remoteInfo) {
        var changed = updateChannelMetadata(targetId, remoteInfo);
        if (changed) {
          renderMarketDrawer(true);
        }
      }
    });
  }
  /* ================= 市场主容器宽度缩放机制 ================= */

  function applyMarketWidth(widthVal) {
    var isMarket = location.hash.indexOf('#/market') === 0;
    var styleEl = document.getElementById('a6-width-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'a6-width-style';
      (document.head || document.documentElement).appendChild(styleEl);
    }

    if (!isMarket || !widthVal || widthVal === 'default') {
      styleEl.textContent = '';
      var prevs = document.querySelectorAll('.a6-market-container-override');
      for (var o = 0; o < prevs.length; o++) {
        prevs[o].classList.remove('a6-market-container-override');
      }
      return;
    }

    var effectiveWidth = '';
    if (widthVal === 'full') {
      effectiveWidth = '100%';
    } else {
      var num = parseFloat(widthVal);
      if (!isNaN(num) && num > 0) {
        var px = Math.round(1200 * num);
        effectiveWidth = 'min(' + px + 'px, calc(100vw - 32px))';
      } else {
        effectiveWidth = widthVal;
      }
    }

    styleEl.textContent =
      ':root{--a6-market-width:' + effectiveWidth + ';}' +
      '.a6-market-container-override, [class*="max-w-"], .container, [class*="container"]{max-width:var(--a6-market-width) !important;width:var(--a6-market-width) !important;margin-left:auto !important;margin-right:auto !important;}' +
      'table, .ant-table, [class*="table"]{width:100% !important;}';

    var table = document.querySelector('table, .ant-table, tbody, [role="table"]');
    if (table) {
      var curr = table.parentElement || table.parentNode;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.classList) {
          curr.classList.add('a6-market-container-override');
        }
        curr = curr.parentElement || curr.parentNode;
      }
    }
  }

  /* ========== 样式定义（包含渠道管理按钮与市场页快捷渠道抽屉） ========== */
  (function () {
    var st = document.getElementById('a6jump-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'a6jump-style';
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
      /* 渠道管理页按钮样式 */
      '.a6jump-wrap{display:inline-flex;align-items:center;vertical-align:middle;margin-left:8px;gap:6px;}' +
      '.a6jump-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'height:24px;padding:0 10px;font-size:12px;line-height:1;font-weight:500;' +
      'color:#27272a;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;cursor:pointer;' +
      'white-space:nowrap;user-select:none;transition:all .15s ease;}' +
      '.a6jump-btn:hover{color:#1677ff;background:rgba(22,119,255,.08);border-color:rgba(22,119,255,.45);}' +
      '.a6jump-btn:active{transform:translateY(1px);}' +

      /* 市场页快捷抽屉浮动触发按钮 */
      '.a6-drawer-trigger{position:fixed;top:10vh;z-index:9999;' +
      'background:#1677ff;color:#ffffff;height:40px;padding:0 12px;cursor:pointer;' +
      'font-size:13px;font-weight:500;' +
      'display:flex;align-items:center;justify-content:center;user-select:none;transition:all .2s ease;box-sizing:border-box;}' +
      '.a6-drawer-trigger.is-side-right{right:0;left:auto;border-radius:8px 0 0 8px;box-shadow:-2px 2px 10px rgba(22,119,255,.35);}' +
      '.a6-drawer-trigger.is-side-left{left:0;right:auto;border-radius:0 8px 8px 0;box-shadow:2px 2px 10px rgba(22,119,255,.35);}' +
      '.a6-drawer-trigger.is-side-right:hover{background:#4096ff;padding-right:14px;}' +
      '.a6-drawer-trigger.is-side-left:hover{background:#4096ff;padding-left:14px;}' +
      '.a6-drawer-trigger.is-hidden{display:none !important;}' +

      /* 抽屉面板（占据页面 80% 高度，上下各留白 10%） */
      '.a6-drawer-panel{position:fixed;top:10vh;bottom:10vh;height:80vh;width:300px;max-width:calc(100vw - 32px);' +
      'background:#ffffff;box-shadow:0 8px 30px rgba(0,0,0,.16);z-index:10000;display:flex;flex-direction:column;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;box-sizing:border-box;' +
      'border:1px solid #e4e4e7;overflow:hidden;transition:transform .25s cubic-bezier(0.16,1,0.3,1);}' +
      '.a6-drawer-panel.is-side-right{right:0;left:auto;border-radius:10px 0 0 10px;border-right:none;transform:translateX(100%);}' +
      '.a6-drawer-panel.is-side-left{left:0;right:auto;border-radius:0 10px 10px 0;border-left:none;transform:translateX(-100%);}' +
      '.a6-drawer-panel.is-open{transform:translateX(0) !important;}' +

      /* 抽屉头部与操作按钮 */
      '.a6-drawer-header{flex-shrink:0;height:40px;padding:0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;background:#fafafa;box-sizing:border-box;}' +
      '.a6-drawer-header.is-side-left{flex-direction:row-reverse;}' +
      '.a6-drawer-title-wrap{display:flex;align-items:center;gap:6px;padding:0 14px;}' +
      '.a6-drawer-title{font-size:14px;font-weight:600;color:#1f2937;}' +
      '.a6-drawer-count{font-size:11px;background:#e5e7eb;color:#4b5563;padding:2px 8px;border-radius:10px;font-weight:600;}' +
      '.a6-drawer-actions{display:flex;align-items:center;height:40px;}' +
      '.a6-drawer-tool-btn{background:#f4f4f5;border:1px solid #e4e4e7;color:#52525b;font-size:11px;padding:2px 6px;border-radius:4px;cursor:pointer;line-height:1.2;transition:all .15s ease;}' +
      '.a6-drawer-tool-btn:hover{color:#1677ff;background:rgba(22,119,255,.08);border-color:rgba(22,119,255,.45);}' +
      '.a6-drawer-close{height:40px;padding:0 12px;cursor:pointer;font-size:13px;font-weight:500;border:none;background:#1677ff;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;user-select:none;transition:all .2s ease;box-sizing:border-box;white-space:nowrap;}' +
      '.a6-drawer-close:hover{background:#4096ff;}' +
      '.a6-drawer-header.is-side-left .a6-drawer-close{border-radius:0 8px 8px 0;box-shadow:2px 2px 10px rgba(22,119,255,.35);}' +
      '.a6-drawer-header.is-side-right .a6-drawer-close{border-radius:8px 0 0 8px;box-shadow:-2px 2px 10px rgba(22,119,255,.35);}' +
      /* 抽屉顶部快捷操作工具栏 */
      '.a6-drawer-toolbar{flex-shrink:0;display:flex;gap:8px;padding:8px 14px;background:#fafafa;border-bottom:1px solid #f0f0f0;box-sizing:border-box;}' +
      '.a6-toolbar-btn{flex:1;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:#374151;background:#ffffff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;white-space:nowrap;user-select:none;transition:all .15s ease;}' +
      '.a6-toolbar-btn:hover{color:#1677ff;border-color:rgba(22,119,255,.45);background:rgba(22,119,255,.08);}' +
      '.a6-toolbar-btn:active{transform:translateY(1px);}' +
      '.a6-toolbar-btn.is-active{color:#1677ff;border-color:rgba(22,119,255,.5);background:rgba(22,119,255,.08);font-weight:600;}' +
      /* 抽屉底部常驻设置栏 */
      '.a6-drawer-footer{flex-shrink:0;padding:10px 14px 12px;background:#fafafa;border-top:1px solid #f0f0f0;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;}' +
      '.a6-footer-row1{display:flex;gap:8px;}' +
      '.a6-drawer-widthbar{display:flex;flex-direction:column;gap:6px;}' +
      '.a6-width-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:#6b7280;}' +
      '.a6-width-input-wrap{display:inline-flex;align-items:center;gap:3px;}' +
      '.a6-width-num-input{width:56px;height:22px;padding:2px 4px;font-size:11px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;border:1px solid #d1d5db;border-radius:4px;background:#ffffff;color:#1f2937;outline:none;box-sizing:border-box;}' +
      '.a6-width-num-input:focus{border-color:#1677ff;box-shadow:0 0 0 1px #1677ff;}' +
      '.a6-width-unit{font-size:11px;font-weight:600;color:#6b7280;}' +
      '.a6-width-presets{display:flex;gap:6px;}' +
      '.a6-width-pill{flex:1;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:#4b5563;background:#ffffff;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;user-select:none;transition:all .15s ease;}' +
      '.a6-width-pill:hover{color:#1677ff;border-color:rgba(22,119,255,.45);background:rgba(22,119,255,.05);}' +
      '.a6-width-pill.active{color:#ffffff;background:#1677ff;border-color:#1677ff;font-weight:600;}' +
      '.a6-width-slider{width:100%;height:4px;-webkit-appearance:none;appearance:none;background:#e5e7eb;border-radius:2px;outline:none;cursor:pointer;margin:4px 0 2px;}' +
      '.a6-width-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:#1677ff;border:2px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:pointer;transition:transform .1s ease;}' +
      '.a6-width-slider::-webkit-slider-thumb:hover{transform:scale(1.2);}' +
      /* 抽屉内容区（填满 80vh 剩余高度 + 独立平滑滚动条） */
      '.a6-drawer-content{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding:10px 14px;}' +
      '.a6-drawer-content::-webkit-scrollbar{width:5px;}' +
      '.a6-drawer-content::-webkit-scrollbar-track{background:transparent;}' +
      '.a6-drawer-content::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px;}' +
      '.a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#94a3b8;}' +
      '.a6-section-header{display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px;}' +
      '.a6-section-header:first-child{margin-top:0;}' +
      '.a6-section-title{font-size:12px;font-weight:600;color:#6b7280;}' +
      '.a6-btn-link{font-size:12px;color:#1677ff;background:none;border:none;cursor:pointer;padding:0;font-weight:500;}' +
      '.a6-btn-link:hover{text-decoration:underline;}' +

      /* 渠道卡片（双行） */
      '.a6-card{background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px;margin-bottom:8px;cursor:pointer;transition:all .15s ease;user-select:none;}' +
      '.a6-card.is-delisted{opacity:0.65;}' +
      '.a6-card-delisted{font-size:11px;font-weight:500;background:#fee2e2;color:#ef4444;border:1px solid #fca5a5;padding:1px 5px;border-radius:4px;flex-shrink:0;}' +
      '.a6-card:hover{background:#f8fafc;border-color:#cbd5e1;}' +
      '.a6-card.active{background:#eff6ff;border-color:#1677ff;box-shadow:0 0 0 1px #1677ff;}' +
      '.a6-card-row1{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.a6-card-name{font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card.active .a6-card-name{color:#1677ff;}' +
      '.a6-card-badges{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;}' +
      '.a6-card-id{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px;}' +
      '.a6-card-del{background:none;border:none;color:#94a3b8;font-size:13px;line-height:1;padding:2px 4px;cursor:pointer;border-radius:3px;}' +
      '.a6-card-del:hover{color:#ef4444;background:#fee2e2;}' +
      '.a6-card-btn-icon{background:none;border:none;color:#94a3b8;font-size:12px;line-height:1;padding:2px 3px;cursor:pointer;border-radius:3px;}' +
      '.a6-card-btn-icon:hover{color:#1677ff;background:rgba(22,119,255,.1);}' +
      '.a6-card-desc{font-size:12px;color:#64748b;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card-remark{font-size:11px;color:#0284c7;background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2px 6px;margin-top:5px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.a6-card-editbox{margin-top:6px;display:flex;flex-direction:column;gap:6px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;}' +
      '.a6-empty-tip{padding:12px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:6px;line-height:1.6;}' +
      '.a6-id-row{display:flex;gap:6px;align-items:center;}' +
      '.a6-input-sm{height:24px;font-size:11px;padding:2px 6px;}' +
      /* 添加表单 */
      '.a6-add-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px;}' +
      '.a6-input{box-sizing:border-box;width:100%;height:28px;padding:4px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;outline:none;background:#fff;color:#1f2937;}' +
      '.a6-input:focus{border-color:#1677ff;box-shadow:0 0 0 1px #1677ff;}' +
      '.a6-form-actions{display:flex;justify-content:flex-end;gap:6px;}' +
      '.a6-btn-sm{height:24px;padding:0 10px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid transparent;}' +
      '.a6-btn-primary{background:#1677ff;color:#fff;}' +
      '.a6-btn-primary:hover{background:#4096ff;}' +
      '.a6-btn-default{background:#fff;border-color:#d1d5db;color:#374151;}' +
      '.a6-btn-default:hover{background:#f3f4f6;}' +
      /* 市场模型列表自选渠道高亮（金黄一体化内嵌发光卡片 + 金黄文字 + 浅金微光） */
      '.a6-market-highlight, .a6-market-highlight-expanded{background:rgba(245,158,11,.06) !important;position:relative;z-index:2;}' +
      '.a6-market-highlight td, .a6-market-highlight-expanded td{background:transparent !important;}' +
      '.a6-market-highlight td:first-child, .a6-market-highlight td:first-child *{color:#f59e0b !important;}' +
      /* 1. 未展开的独立高亮行：四周边框内嵌闭合 + 四角圆角（防止容器 overflow:hidden 截断左右侧边框） */
      '.a6-market-highlight:not(.a6-market-highlight-parent):not(.a6-market-highlight-expanded) td{box-shadow:inset 0 1px 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;}' +
      '.a6-market-highlight:not(.a6-market-highlight-parent):not(.a6-market-highlight-expanded) td:first-child:not(:last-child){box-shadow:inset 1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-top-left-radius:6px;border-bottom-left-radius:6px;}' +
      '.a6-market-highlight:not(.a6-market-highlight-parent):not(.a6-market-highlight-expanded) td:last-child:not(:first-child){box-shadow:inset -1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-top-right-radius:6px;border-bottom-right-radius:6px;}' +
      '.a6-market-highlight:not(.a6-market-highlight-parent):not(.a6-market-highlight-expanded) td:first-child:last-child{box-shadow:inset 1px 0 0 #f59e0b, inset -1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-radius:6px;}' +
      /* 2. 已展开的主行：上、左、右边框内嵌 + 顶部双圆角（去底边） */
      '.a6-market-highlight.a6-market-highlight-parent td{box-shadow:inset 0 1px 0 #f59e0b !important;border-bottom:1px dashed rgba(245,158,11,.25) !important;}' +
      '.a6-market-highlight.a6-market-highlight-parent td:first-child:not(:last-child){box-shadow:inset 1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b !important;border-top-left-radius:6px;border-bottom-left-radius:0;}' +
      '.a6-market-highlight.a6-market-highlight-parent td:last-child:not(:first-child){box-shadow:inset -1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b !important;border-top-right-radius:6px;border-bottom-right-radius:0;}' +
      '.a6-market-highlight.a6-market-highlight-parent td:first-child:last-child{box-shadow:inset 1px 0 0 #f59e0b, inset -1px 0 0 #f59e0b, inset 0 1px 0 #f59e0b !important;border-top-left-radius:6px;border-top-right-radius:6px;}' +
      /* 3. 展开详情行：下、左、右边框内嵌 + 底部双圆角（去顶边，与主行缝合为一体大卡片） */
      '.a6-market-highlight-expanded td{box-shadow:inset 0 -1px 0 #f59e0b !important;}' +
      '.a6-market-highlight-expanded td:first-child:not(:last-child){box-shadow:inset 1px 0 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-bottom-left-radius:6px;border-top-left-radius:0;}' +
      '.a6-market-highlight-expanded td:last-child:not(:first-child){box-shadow:inset -1px 0 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-bottom-right-radius:6px;border-top-right-radius:0;}' +
      '.a6-market-highlight-expanded td:first-child:last-child{box-shadow:inset 1px 0 0 #f59e0b, inset -1px 0 0 #f59e0b, inset 0 -1px 0 #f59e0b !important;border-bottom-left-radius:6px;border-bottom-right-radius:6px;border-top-left-radius:0;border-top-right-radius:0;}' +
      /* 4. 右侧操作区按钮自然融合：留足内边距防止遮挡右内边框，使按钮组背景融入行底色 */
      '.a6-market-highlight td:last-child{padding-right:12px !important;}' +
      '.a6-market-highlight td:last-child > div, .a6-market-highlight td:last-child [class*="action"], .a6-market-highlight td:last-child [class*="btn"]{background:transparent !important;border-color:rgba(245,158,11,.2) !important;}' +
      /* 暗色模式适配（同时支持系统 prefers-color-scheme 与页面 .dark / [data-theme="dark"]） */
      '@media (prefers-color-scheme:dark){' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-panel.is-side-right{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-right:none;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-panel.is-side-left{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-left:none;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-header{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-count{background:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-title{color:#fafafa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-tool-btn{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-tool-btn:hover{color:#60a5fa;border-color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-toolbar{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-toolbar-btn{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-toolbar-btn:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-toolbar-btn.is-active{background:rgba(96,165,250,.18);border-color:#60a5fa;color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-footer{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-top{color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-num-input{background:#18181b;border-color:#3f3f46;color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-unit{color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-pill{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-pill:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-pill.active{background:#1677ff;border-color:#1677ff;color:#ffffff;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-width-slider{background:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card:hover{background:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card.active{background:rgba(22,119,255,.18);border-color:#1677ff;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-name{color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-desc{color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-remark{background:#082f49;color:#7dd3fc;border-color:#0369a1;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-editbox{background:#18181b;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-delisted{background:#451a1a;color:#fca5a5;border-color:#7f1d1d;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-card-id{background:#3f3f46;color:#d4d4d8;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-input{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-add-box{background:#27272a;border-color:#3f3f46;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-empty-tip{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-content::-webkit-scrollbar-thumb{background:#52525b;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#71717a;}' +
      ':root:not(.light):not([data-theme="light"]) .a6-btn-default{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      ':root:not(.light):not([data-theme="light"]) .a6jump-btn{background:#27272a;color:#f4f4f5;border-color:#3f3f46;}' +
      '}' +
      '.dark .a6-drawer-panel.is-side-right,[data-theme="dark"] .a6-drawer-panel.is-side-right{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-right:none;}' +
      '.dark .a6-drawer-panel.is-side-left,[data-theme="dark"] .a6-drawer-panel.is-side-left{background:#18181b;box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#3f3f46;border-left:none;}' +
      '.dark .a6-drawer-header,[data-theme="dark"] .a6-drawer-header{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-drawer-count,[data-theme="dark"] .a6-drawer-count{background:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-drawer-title,[data-theme="dark"] .a6-drawer-title{color:#fafafa;}' +
      '.dark .a6-drawer-tool-btn,[data-theme="dark"] .a6-drawer-tool-btn{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      '.dark .a6-drawer-tool-btn:hover,[data-theme="dark"] .a6-drawer-tool-btn:hover{color:#60a5fa;border-color:#60a5fa;}' +
      '.dark .a6-drawer-toolbar,[data-theme="dark"] .a6-drawer-toolbar{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-toolbar-btn,[data-theme="dark"] .a6-toolbar-btn{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-toolbar-btn:hover,[data-theme="dark"] .a6-toolbar-btn:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      '.dark .a6-toolbar-btn.is-active,[data-theme="dark"] .a6-toolbar-btn.is-active{background:rgba(96,165,250,.18);border-color:#60a5fa;color:#60a5fa;}' +
      '.dark .a6-drawer-footer,[data-theme="dark"] .a6-drawer-footer{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-width-top,[data-theme="dark"] .a6-width-top{color:#a1a1aa;}' +
      '.dark .a6-width-num-input,[data-theme="dark"] .a6-width-num-input{background:#18181b;border-color:#3f3f46;color:#f4f4f5;}' +
      '.dark .a6-width-unit,[data-theme="dark"] .a6-width-unit{color:#a1a1aa;}' +
      '.dark .a6-width-pill,[data-theme="dark"] .a6-width-pill{background:#18181b;border-color:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-width-pill:hover,[data-theme="dark"] .a6-width-pill:hover{background:#27272a;border-color:#60a5fa;color:#60a5fa;}' +
      '.dark .a6-width-pill.active,[data-theme="dark"] .a6-width-pill.active{background:#1677ff;border-color:#1677ff;color:#ffffff;}' +
      '.dark .a6-width-slider,[data-theme="dark"] .a6-width-slider{background:#3f3f46;}' +
      '.dark .a6-card,[data-theme="dark"] .a6-card{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-card:hover,[data-theme="dark"] .a6-card:hover{background:#3f3f46;}' +
      '.dark .a6-card.active,[data-theme="dark"] .a6-card.active{background:rgba(22,119,255,.18);border-color:#1677ff;}' +
      '.dark .a6-card-name,[data-theme="dark"] .a6-card-name{color:#f4f4f5;}' +
      '.dark .a6-card-desc,[data-theme="dark"] .a6-card-desc{color:#a1a1aa;}' +
      '.dark .a6-card-remark,[data-theme="dark"] .a6-card-remark{background:#082f49;color:#7dd3fc;border-color:#0369a1;}' +
      '.dark .a6-card-editbox,[data-theme="dark"] .a6-card-editbox{background:#18181b;border-color:#3f3f46;}' +
      '.dark .a6-card-delisted,[data-theme="dark"] .a6-card-delisted{background:#451a1a;color:#fca5a5;border-color:#7f1d1d;}' +
      '.dark .a6-card-id,[data-theme="dark"] .a6-card-id{background:#3f3f46;color:#d4d4d8;}' +
      '.dark .a6-input,[data-theme="dark"] .a6-input{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      '.dark .a6-add-box,[data-theme="dark"] .a6-add-box{background:#27272a;border-color:#3f3f46;}' +
      '.dark .a6-empty-tip,[data-theme="dark"] .a6-empty-tip{background:#27272a;border-color:#3f3f46;color:#a1a1aa;}' +
      '.dark .a6-drawer-content::-webkit-scrollbar-thumb,[data-theme="dark"] .a6-drawer-content::-webkit-scrollbar-thumb{background:#52525b;}' +
      '.dark .a6-drawer-content::-webkit-scrollbar-thumb:hover,[data-theme="dark"] .a6-drawer-content::-webkit-scrollbar-thumb:hover{background:#71717a;}' +
      '.dark .a6-btn-default,[data-theme="dark"] .a6-btn-default{background:#27272a;border-color:#3f3f46;color:#f4f4f5;}' +
      '.dark .a6jump-btn,[data-theme="dark"] .a6jump-btn{background:#27272a;color:#f4f4f5;border-color:#3f3f46;}';
  })();

  /* ================= 市场页搜索联动逻辑 ================= */

  var activeChannelId = '';

  function setReactInputValue(input, value) {
    var proto = window.HTMLInputElement ? window.HTMLInputElement.prototype : null;
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (desc && desc.set) {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      try {
        Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
        Object.defineProperty(ev, 'which', { get: function () { return 13; } });
      } catch (e) { }
      el.dispatchEvent(ev);
    });
  }

  function highlightActiveCard(cid) {
    var cards = document.querySelectorAll('.a6-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-cid') === String(cid)) {
        cards[i].classList.add('active');
      } else {
        cards[i].classList.remove('active');
      }
    }
  }
  /* ================= 市场模型列表自选渠道高亮联动 ================= */

  function isExpandedChildRow(el) {
    if (!el || !el.classList) return false;
    if (el.style && (el.style.display === 'none' || el.hidden)) return false;
    if (el.hasAttribute && el.hasAttribute('hidden')) return false;
    var cls = el.className || '';
    if (typeof cls !== 'string') cls = String(cls);
    if (cls.indexOf('expanded-row') !== -1 || el.classList.contains('ant-table-expanded-row')) {
      return true;
    }
    var tds = el.querySelectorAll ? el.querySelectorAll('td') : (el.children || []);
    if (tds.length === 1 && tds[0] && tds[0].hasAttribute && tds[0].hasAttribute('colspan')) {
      return true;
    }
    return false;
  }

  function updateMarketHighlights() {
    if (location.hash.indexOf('#/market') !== 0) return;

    // 1) 检查是否需要抑制高亮（当且仅当切换为“渠道”维度搜索且搜索框非空）
    var isChannelSearch = false;
    var searchInput = document.querySelector('input.ui-search-field');
    var query = searchInput ? (searchInput.value || '').trim() : '';

    if (query) {
      var chips = document.querySelectorAll('button.ui-switch-tag');
      for (var c = 0; c < chips.length; c++) {
        var chip = chips[c];
        var isCurrent = (chip.className || '').indexOf('active') >= 0 || (chip.className || '').indexOf('selected') >= 0;
        if (isCurrent && (chip.textContent || '').trim() === '渠道') {
          isChannelSearch = true;
          break;
        }
      }
    }

    if (isChannelSearch) {
      var prevHighlights = document.querySelectorAll('.a6-market-highlight, .a6-market-highlight-parent, .a6-market-highlight-expanded');
      for (var p = 0; p < prevHighlights.length; p++) {
        prevHighlights[p].classList.remove('a6-market-highlight');
        prevHighlights[p].classList.remove('a6-market-highlight-parent');
        prevHighlights[p].classList.remove('a6-market-highlight-expanded');
      }
      return;
    }

    // 2) 收集所有快捷渠道 ID（自有 + 自定义）
    var targetIds = new Set();
    var owned = storageGet(STORAGE_KEY_OWNED, {});
    for (var oid in owned) {
      if (owned.hasOwnProperty(oid)) targetIds.add(String(oid).trim());
    }
    var custom = storageGet(STORAGE_KEY_CUSTOM, []);
    for (var ci = 0; ci < custom.length; ci++) {
      if (custom[ci] && custom[ci].id) targetIds.add(String(custom[ci].id).trim());
    }

    if (targetIds.size === 0) {
      var noIdsHighlights = document.querySelectorAll('.a6-market-highlight, .a6-market-highlight-parent, .a6-market-highlight-expanded');
      for (var nh = 0; nh < noIdsHighlights.length; nh++) {
        noIdsHighlights[nh].classList.remove('a6-market-highlight');
        noIdsHighlights[nh].classList.remove('a6-market-highlight-parent');
        noIdsHighlights[nh].classList.remove('a6-market-highlight-expanded');
      }
      return;
    }

    // 3) 扫描市场中所有行及展开项（支持 tbody tr, .market-row, [role="row"], .ant-table-row 等）
    var rows = document.querySelectorAll('tbody tr, .market-row, [role="row"], .ant-table-row, [class*="table-row"]');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      // 提取“渠道 #ID”中的数字（排除“供应商 #ID”等非渠道编号）
      var text = row.textContent || '';
      var cleanText = text.replace(/供应商\s*#?\s*\d+/g, '');
      var m = cleanText.match(/(?:渠道\s*#?|#)\s*(\d+)/);
      var rowCid = m ? m[1] : '';

      if (!rowCid && row.getAttribute) {
        rowCid = row.getAttribute('data-cid') || row.getAttribute('data-channel-id') || '';
      }

      var nextRow = row.nextElementSibling;
      var hasExpandedChild = nextRow && isExpandedChildRow(nextRow);

      if (rowCid && targetIds.has(rowCid)) {
        if (!row.classList.contains('a6-market-highlight')) {
          row.classList.add('a6-market-highlight');
        }
        if (hasExpandedChild) {
          if (!row.classList.contains('a6-market-highlight-parent')) {
            row.classList.add('a6-market-highlight-parent');
          }
          if (!nextRow.classList.contains('a6-market-highlight')) {
            nextRow.classList.add('a6-market-highlight');
          }
          if (!nextRow.classList.contains('a6-market-highlight-expanded')) {
            nextRow.classList.add('a6-market-highlight-expanded');
          }
        } else {
          if (row.classList.contains('a6-market-highlight-parent')) {
            row.classList.remove('a6-market-highlight-parent');
          }
        }
      } else {
        // 如果当前行不是快捷渠道，且也不是高亮父行的展开子行，则清理高亮
        var prevRow = row.previousElementSibling;
        var isChildOfHighlighted = isExpandedChildRow(row) && prevRow && prevRow.classList && prevRow.classList.contains('a6-market-highlight');
        if (!isChildOfHighlighted) {
          if (row.classList.contains('a6-market-highlight')) {
            row.classList.remove('a6-market-highlight');
          }
          if (row.classList.contains('a6-market-highlight-parent')) {
            row.classList.remove('a6-market-highlight-parent');
          }
          if (row.classList.contains('a6-market-highlight-expanded')) {
            row.classList.remove('a6-market-highlight-expanded');
          }
        }
      }
    }
  }
  function alignMarketFiltersToDefault() {
    var tags = document.querySelectorAll('button, div[role="button"], .ui-switch-tag, .ui-filter-tag, span, [class*="tag"]');
    for (var j = 0; j < tags.length; j++) {
      var el = tags[j];
      var txt = (el.textContent || '').trim();
      var isBrandAll = txt === '全部品牌' || txt.indexOf('全部品牌') === 0;
      var isModelAll = txt === '全部';
      var isRecommend = txt.indexOf('综合推荐') !== -1;

      if (isBrandAll || isModelAll || isRecommend) {
        var cls = el.className || '';
        var parentCls = (el.parentElement && el.parentElement.className) || '';
        var isActive = cls.indexOf('active') !== -1 || cls.indexOf('selected') !== -1 ||
                       parentCls.indexOf('active') !== -1 || parentCls.indexOf('selected') !== -1;
        if (!isActive) {
          var targetEl = (el.tagName === 'BUTTON' || (el.getAttribute && el.getAttribute('role') === 'button'))
            ? el
            : ((el.closest && el.closest('button, [role="button"]')) || el);
          try {
            targetEl.click();
          } catch (e) {}
        }
      }
    }
  }

  function performMarketSearch(cid) {
    if (!cid) return;
    activeChannelId = String(cid);
    highlightActiveCard(activeChannelId);

    if (location.hash.indexOf('#/market') !== 0) return;

    // 0) 靶向对齐重置多维筛选：全部品牌、全部(模型系列)、综合推荐(默认)
    alignMarketFiltersToDefault();

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var input = document.querySelector('input.ui-search-field');
      var chips = document.querySelectorAll('button.ui-switch-tag');
      var chip = null;
      for (var i = 0; i < chips.length; i++) {
        if ((chips[i].textContent || '').trim() === '渠道') {
          chip = chips[i];
          break;
        }
      }
      if (!input || !chip) {
        if (tries > 60) clearInterval(timer);
        return;
      }
      clearInterval(timer);

      // 再次确保多维筛选对齐
      alignMarketFiltersToDefault();

      // 1) 选中“渠道”维度
      if ((chip.className || '').indexOf('active') < 0) chip.click();

      // 2) 填入渠道ID并按回车搜索
      setTimeout(function () {
        input.focus();
        setReactInputValue(input, cid);
        setTimeout(function () {
          pressEnter(input);
          setTimeout(updateMarketHighlights, 350);
        }, 300);
      }, 250);
    }, 300);
  }

  function clearMarketSearch() {
    activeChannelId = '';
    highlightActiveCard('');
    var input = document.querySelector('input.ui-search-field');
    if (input) {
      input.focus();
      setReactInputValue(input, '');
      setTimeout(function () {
        pressEnter(input);
        setTimeout(updateMarketHighlights, 150);
      }, 100);
    }
  }

  function resetMarketplace() {
    clearMarketSearch();

    // 1) 优先触发官方“重置所有筛选”按钮
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++) {
      var btnText = (allBtns[i].textContent || '').trim();
      if (btnText.indexOf('重置所有筛选') !== -1) {
        allBtns[i].click();
        break;
      }
    }

    // 2) 兜底对齐全部品牌、全部模型、综合推荐与默认维度
    setTimeout(function () {
      var tags = document.querySelectorAll('button, div[role="button"], .ui-switch-tag, .ui-filter-tag, span');
      for (var j = 0; j < tags.length; j++) {
        var el = tags[j];
        var txt = (el.textContent || '').trim();
        if (txt === '全部品牌' || txt === '全部' || txt.indexOf('综合推荐') !== -1 || txt === '模型') {
          var cls = el.className || '';
          if (cls.indexOf('active') === -1 && cls.indexOf('selected') === -1) {
            el.click();
          }
        }
      }
      setTimeout(updateMarketHighlights, 200);
    }, 150);
  }
  // 地址栏初始化渠道搜索（?cid=xxxx#/market）
  var pendingCid = (function () {
    var m = location.search.match(/[?&]cid=([^&]+)/);
    var fromHash = false;
    if (!m) {
      m = location.hash.match(/[?&]cid=([^&]+)/);
      fromHash = !!m;
    }
    if (!m) return null;
    var id = '';
    try {
      id = decodeURIComponent(m[1]);
    } catch (e) {
      id = m[1];
    }
    id = (id || '').trim();
    if (!id) return null;
    try {
      if (fromHash) {
        var cleanHash = location.hash.replace(/[?&]cid=[^&]+/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanHash);
      } else {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    } catch (e) { }
    return id;
  })();

  if (pendingCid) {
    performMarketSearch(pendingCid);
  }

  /* ================= 渠道列表：在名称右侧注入两个快捷按钮并同步缓存 ================= */

  var BTN_MARK = 'data-a6jump';
  var BTN_VER = '140';

  function isRowOnline(row) {
    var pill = row.querySelector('.sc-status-pill');
    if (pill) {
      if (pill.classList.contains('is-online')) return true;
      if (pill.classList.contains('is-offline')) return false;
      var text = (pill.textContent || '').trim();
      if (text === '已上架' || text.toLowerCase() === 'online') return true;
      if (text === '已下架' || text.toLowerCase() === 'offline') return false;
      if (text.indexOf('已上架') !== -1) return true;
      if (text.indexOf('下架') !== -1) return false;
    }
    if (row.querySelector('.btn-ban.is-banned')) return false;
    var btns = row.querySelectorAll('.mp-act-btn');
    for (var i = 0; i < btns.length; i++) {
      var bText = (btns[i].textContent || btns[i].getAttribute('title') || '').trim();
      if (bText === '下架' || bText === 'Take Offline') return true;
      if (bText === '恢复' || bText === 'Restore') return false;
    }
    return false;
  }

  function marketUrl(id) {
    return MARKET_BASE + '?cid=' + encodeURIComponent(id) + '#/market';
  }

  function getRowId(el) {
    var row = el.closest ? el.closest('tr') : null;
    var idBtn = row ? row.querySelector('button.sc-mono-id') : null;
    var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
    if (!id) {
      var wrap = el.closest ? el.closest('[data-a6id]') : null;
      if (wrap) id = (wrap.getAttribute('data-a6id') || '').trim();
    }
    return id;
  }

  function openForeground(id) {
    var w = window.open(marketUrl(id), '_blank');
    if (!w) location.href = marketUrl(id);
  }

  function openBackground(id) {
    var url = marketUrl(id);
    try {
      if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: false, insert: true, setParent: true });
        return;
      }
      if (typeof GM !== 'undefined' && GM && typeof GM.openInTab === 'function') {
        GM.openInTab(url, { active: false, insert: true, setParent: true });
        return;
      }
    } catch (e) { }
    var w = window.open(url, '_blank');
    if (w) {
      setTimeout(function () {
        try { w.blur(); } catch (e) { }
        try { window.focus(); } catch (e) { }
      }, 0);
    } else {
      location.href = url;
    }
  }

  function makeButton(label, tip, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'a6jump-btn';
    b.textContent = label;
    b.title = tip;
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var id = getRowId(b);
      if (id) onClick(id);
    });
    return b;
  }

  function getCleanChannelName(nameSpan) {
    if (typeof nameSpan.cloneNode === 'function') {
      var clone = nameSpan.cloneNode(true);
      var wraps = clone.querySelectorAll ? clone.querySelectorAll('.a6jump-wrap') : [];
      for (var i = 0; i < wraps.length; i++) wraps[i].remove();
      return (clone.textContent || '').trim();
    }
    var fullText = (nameSpan.textContent || '').trim();
    return fullText.replace(/查市场|后台查/g, '').trim();
  }

  function getRowDesc(row, cleanName) {
    var descEl = null;
    var selectors = ['.sc-channel-desc', '.sc-channel-description', '.sc-channel-sub', '.channel-desc', '[class*="desc"]'];
    if (row.querySelector) {
      for (var s = 0; s < selectors.length; s++) {
        descEl = row.querySelector(selectors[s]);
        if (descEl) break;
      }
    }
    if (descEl) {
      var dt = (descEl.textContent || '').trim();
      if (dt) return dt;
    }
    var nameSpan = row.querySelector('.sc-channel-name');
    if (nameSpan) {
      var title = nameSpan.getAttribute('title');
      if (title && title.trim() && title.trim() !== cleanName) {
        return title.trim();
      }
      var td = nameSpan.closest ? nameSpan.closest('td') : (nameSpan.parentNode && nameSpan.parentNode.tagName === 'TD' ? nameSpan.parentNode : null);
      if (td) {
        var subEls = td.querySelectorAll('div, p, span, small');
        for (var i = 0; i < subEls.length; i++) {
          var el = subEls[i];
          if (el !== nameSpan && !el.classList.contains('sc-channel-name') && !el.classList.contains('a6jump-wrap')) {
            var txt = (el.textContent || '').trim();
            if (txt && txt !== cleanName) return txt;
          }
        }
      }
    }
    return '';
  }

  function scanRows() {
    if (location.hash.indexOf('#/merchant/channels') !== 0) return;
    var rows = document.querySelectorAll('tbody tr');
    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    var changed = false;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nameSpan = row.querySelector('.sc-channel-name');
      if (!nameSpan) continue;

      var idBtn = row.querySelector('button.sc-mono-id');
      var id = idBtn ? (idBtn.getAttribute('title') || idBtn.textContent || '').trim() : '';
      if (!id) continue;

      var online = isRowOnline(row);
      var stale = nameSpan.querySelectorAll('[' + BTN_MARK + ']');

      if (!online) {
        for (var j = 0; j < stale.length; j++) stale[j].remove();
        if (ownedMap[id]) {
          if (!ownedMap[id].delisted) {
            ownedMap[id].delisted = true;
            ownedMap[id].updatedAt = Date.now();
            changed = true;
          }
        } else {
          var offCleanName = getCleanChannelName(nameSpan);
          var offDesc = getRowDesc(row, offCleanName);
          ownedMap[id] = { id: id, name: offCleanName || id, desc: offDesc, delisted: true, updatedAt: Date.now() };
          changed = true;
        }
        continue;
      }

      var cleanName = getCleanChannelName(nameSpan);
      var desc = getRowDesc(row, cleanName);
      var existing = ownedMap[id];
      if (!existing || existing.name !== cleanName || existing.desc !== desc || existing.delisted) {
        ownedMap[id] = { id: id, name: cleanName || id, desc: desc, delisted: false, updatedAt: Date.now() };
        changed = true;
      }

      if (nameSpan.querySelector('[' + BTN_MARK + '="' + BTN_VER + '"]')) continue;
      for (var k = 0; k < stale.length; k++) stale[k].remove();

      var wrap = document.createElement('span');
      wrap.className = 'a6jump-wrap';
      wrap.setAttribute(BTN_MARK, BTN_VER);
      wrap.setAttribute('data-a6id', id);
      wrap.appendChild(makeButton('查市场', '在新标签页打开市场，并以“渠道”维度搜索该渠道ID', openForeground));
      wrap.appendChild(makeButton('后台查', '在后台新标签页打开市场并搜索该渠道ID（不切换当前页面）', openBackground));
      nameSpan.appendChild(wrap);
    }

    if (changed) {
      storageSet(STORAGE_KEY_OWNED, ownedMap);
    }
  }

  /* ================= 市场页：模型列表触底自动加载更多 (Auto Load More) ================= */

  var autoLoadObserver = null;
  var autoLoadLastTrigger = 0;
  var autoLoadObservedEl = null;

  function isLoadMoreUsable(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.classList && (el.classList.contains('is-loading') || el.classList.contains('ant-btn-loading'))) return false;
    if (el.style && el.style.display === 'none') return false;
    return true;
  }

  function findLoadMoreButton() {
    if (location.hash.indexOf('#/market') !== 0) return null;
    var direct = document.querySelector('.mp-load-more-btn');
    if (direct && isLoadMoreUsable(direct)) return direct;

    var candidates = document.querySelectorAll('.mp-load-more-btn, button, [role="button"], .ant-btn, .btn, a');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').trim();
      if (text.indexOf('加载更多') !== -1 || /load\s*more/i.test(text)) {
        if (isLoadMoreUsable(el)) return el;
      }
    }
    return null;
  }

  function triggerAutoLoad(btn) {
    var now = Date.now();
    if (now - autoLoadLastTrigger < 600) return;
    autoLoadLastTrigger = now;
    try {
      btn.click();
    } catch (e) {}
  }

  function syncAutoLoadObserver() {
    var isMarket = location.hash.indexOf('#/market') === 0;
    var enabled = storageGet(STORAGE_KEY_AUTO_LOAD, false);
    if (!isMarket || !enabled || typeof IntersectionObserver !== 'function') {
      if (autoLoadObserver) {
        autoLoadObserver.disconnect();
        autoLoadObserver = null;
        autoLoadObservedEl = null;
      }
      return;
    }

    var btn = findLoadMoreButton();
    if (!btn) {
      if (autoLoadObserver) {
        autoLoadObserver.disconnect();
        autoLoadObserver = null;
        autoLoadObservedEl = null;
      }
      return;
    }

    if (autoLoadObservedEl === btn && autoLoadObserver) {
      return;
    }

    if (autoLoadObserver) {
      autoLoadObserver.disconnect();
    }

    autoLoadObservedEl = btn;
    autoLoadObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          var targetBtn = findLoadMoreButton();
          if (targetBtn) {
            triggerAutoLoad(targetBtn);
          }
        }
      }
    }, { rootMargin: '200px' });
    autoLoadObserver.observe(btn);
  }

  /* ================= 市场页：快捷渠道抽屉面板 (Quick Channel Drawer) ================= */

  function renderMarketDrawer(force) {
    var isMarket = location.hash.indexOf('#/market') === 0;
    var container = document.getElementById('a6-drawer-container');

    if (!isMarket) {
      if (container) container.style.display = 'none';
      return;
    }

    if (!force && container && document.getElementById('a6-drawer-panel') && container.style.display !== 'none') {
      return;
    }

    if (!container) {
      container = document.createElement('div');
      container.id = 'a6-drawer-container';
      (document.body || document.documentElement).appendChild(container);
    }
    container.style.display = '';

    var oldContent = container.querySelector('.a6-drawer-content');
    var savedScrollTop = oldContent ? oldContent.scrollTop : 0;

    var rawOpen = storageGet(STORAGE_KEY_DRAWER_OPEN, true);
    var isOpen = rawOpen !== false && rawOpen !== 'false';
    var currentSide = storageGet(STORAGE_KEY_DRAWER_SIDE, 'left');
    if (currentSide !== 'left' && currentSide !== 'right') currentSide = 'left';

    var ownedMap = storageGet(STORAGE_KEY_OWNED, {});
    var customList = storageGet(STORAGE_KEY_CUSTOM, []);
    var ownedList = Object.keys(ownedMap).map(function (k) { return ownedMap[k]; });

    container.innerHTML = '';

    // 1) 触发胶囊按钮
    var trigger = document.createElement('div');
    trigger.id = 'a6-drawer-trigger';
    trigger.className = 'a6-drawer-trigger is-side-' + currentSide + (isOpen ? ' is-hidden' : '');
    trigger.title = '打开快捷渠道面板';
    trigger.innerHTML = '<span>📌 快捷渠道</span>';
    trigger.addEventListener('click', function () {
      setDrawerOpen(true);
    });
    container.appendChild(trigger);

    // 2) 抽屉面板
    var panel = document.createElement('div');
    panel.id = 'a6-drawer-panel';
    panel.className = 'a6-drawer-panel is-side-' + currentSide + (isOpen ? ' is-open' : '');

    // 头部
    var header = document.createElement('div');
    header.className = 'a6-drawer-header' + (currentSide === 'left' ? ' is-side-left' : ' is-side-right');
    var titleWrap = document.createElement('div');
    titleWrap.className = 'a6-drawer-title-wrap';
    var countBadge = document.createElement('span');
    countBadge.className = 'a6-drawer-count';
    countBadge.textContent = '共 ' + (ownedList.length + customList.length) + ' 渠道';
    titleWrap.appendChild(countBadge);

    var actionsWrap = document.createElement('div');
    actionsWrap.className = 'a6-drawer-actions';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'a6-drawer-close';
    closeBtn.title = '收起面板';
    closeBtn.innerHTML = '<span>✕ 快捷渠道</span>';
    closeBtn.addEventListener('click', function () {
      setDrawerOpen(false);
    });

    actionsWrap.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(actionsWrap);
    panel.appendChild(header);

    // 快捷操作工具栏
    var toolbar = document.createElement('div');
    toolbar.className = 'a6-drawer-toolbar';

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'a6-toolbar-btn a6-btn-clear';
    clearBtn.title = '清空搜索框与渠道选择，保留其他筛选';
    clearBtn.innerHTML = '<span>🧹 清空搜索</span>';
    clearBtn.addEventListener('click', function () {
      clearMarketSearch();
    });

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'a6-toolbar-btn a6-btn-reset';
    resetBtn.title = '还原市场至默认推荐状态（全部品牌/全部模型/综合推荐）';
    resetBtn.innerHTML = '<span>⟲ 重置市场</span>';
    resetBtn.addEventListener('click', function () {
      resetMarketplace();
    });

    var syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = 'a6-toolbar-btn a6-btn-sync';
    syncBtn.title = '批量拉取所有快捷渠道的最新名称、说明与在架状态';
    syncBtn.innerHTML = '<span>⟳ 同步渠道</span>';
    syncBtn.addEventListener('click', function () {
      if (syncBtn.disabled) return;
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<span>⏳ 同步中...</span>';
      syncAllChannels(function (res) {
        renderMarketDrawer(true);
        var curSyncBtn = document.querySelector('.a6-btn-sync');
        if (curSyncBtn) {
          if (res && res.merchantAuthError) {
            curSyncBtn.innerHTML = '<span>⚠️ 商户未登录</span>';
          } else {
            var countStr = res && typeof res.updated === 'number' && res.updated > 0 ? (' (+' + res.updated + ')') : '';
            curSyncBtn.innerHTML = '<span>✓ 已同步' + countStr + '</span>';
          }
          setTimeout(function () {
            if (curSyncBtn) {
              curSyncBtn.innerHTML = '<span>⟳ 同步渠道</span>';
              curSyncBtn.disabled = false;
            }
          }, 2000);
        }
      });
    });

    toolbar.appendChild(clearBtn);
    toolbar.appendChild(resetBtn);
    toolbar.appendChild(syncBtn);
    panel.appendChild(toolbar);

    // 内容区
    var content = document.createElement('div');
    content.className = 'a6-drawer-content';
    content.addEventListener('wheel', function (ev) {
      var delta = ev.deltaY || (ev.detail ? ev.detail * 40 : 0);
      if (!delta) return;
      var maxScroll = content.scrollHeight - content.clientHeight;
      if (maxScroll <= 0) return;
      var canScrollDown = content.scrollTop < maxScroll - 1;
      var canScrollUp = content.scrollTop > 1;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        content.scrollTop += delta;
        ev.stopPropagation();
        if (ev.cancelable) ev.preventDefault();
      }
    }, { passive: false });
    // 分组 1: 我的渠道
    var secOwned = document.createElement('div');
    var secOwnedHeader = document.createElement('div');
    secOwnedHeader.className = 'a6-section-header';
    var secOwnedTitle = document.createElement('span');
    secOwnedTitle.className = 'a6-section-title';
    secOwnedTitle.textContent = '我的渠道 (' + ownedList.length + ')';
    secOwnedHeader.appendChild(secOwnedTitle);
    secOwned.appendChild(secOwnedHeader);

    if (ownedList.length === 0) {
      var emptyTip = document.createElement('div');
      emptyTip.className = 'a6-empty-tip';
      emptyTip.textContent = '暂无同步数据，请访问一次「渠道管理」页自动同步';
      secOwned.appendChild(emptyTip);
    } else {
      ownedList.forEach(function (ch) {
        secOwned.appendChild(createChannelCard(ch, false));
      });
    }
    content.appendChild(secOwned);

    // 分组 2: 自定义渠道
    var secCustom = document.createElement('div');
    var secCustomHeader = document.createElement('div');
    secCustomHeader.className = 'a6-section-header';
    var secCustomTitle = document.createElement('span');
    secCustomTitle.className = 'a6-section-title';
    secCustomTitle.textContent = '自定义渠道 (' + customList.length + ')';

    var addToggleBtn = document.createElement('button');
    addToggleBtn.type = 'button';
    addToggleBtn.className = 'a6-btn-link';
    addToggleBtn.textContent = '+ 添加';
    secCustomHeader.appendChild(secCustomTitle);
    secCustomHeader.appendChild(addToggleBtn);
    secCustom.appendChild(secCustomHeader);

    // 自定义添加表单
    var addBox = document.createElement('div');
    addBox.className = 'a6-add-box';
    addBox.style.display = 'none';

    var idRow = document.createElement('div');
    idRow.className = 'a6-id-row';

    var idInput = document.createElement('input');
    idInput.className = 'a6-input';
    idInput.style.flex = '1';
    idInput.placeholder = '渠道 ID * (如 101)';

    var fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.className = 'a6-btn-sm a6-btn-default a6-btn-fetch';
    fetchBtn.title = '从已同步渠道或市场检索并自动回填名称与说明';
    fetchBtn.textContent = '🔍 获取';
    fetchBtn.addEventListener('click', function () {
      var cid = idInput.value.trim();
      if (!cid) {
        idInput.focus();
        return;
      }
      var origText = fetchBtn.textContent;
      fetchBtn.disabled = true;
      fetchBtn.textContent = '⏳ ...';
      fetchChannelInfo(cid, function (info) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = origText;
        if (info) {
          if (info.name) nameInput.value = info.name;
          if (info.desc) descInput.value = info.desc;
          if (info.remark && !remarkInput.value) remarkInput.value = info.remark;
          if (!info.name && !info.desc) {
            nameInput.focus();
          }
        }
      });
    });

    idInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        fetchBtn.click();
      }
    });

    idRow.appendChild(idInput);
    idRow.appendChild(fetchBtn);

    var nameInput = document.createElement('input');
    nameInput.className = 'a6-input';
    nameInput.placeholder = '渠道名称 * (如 能能CC-2)';

    var descInput = document.createElement('input');
    descInput.className = 'a6-input';
    descInput.placeholder = '渠道说明 (选填，如 CC Kiro 保智商)';

    var remarkInput = document.createElement('input');
    remarkInput.className = 'a6-input';
    remarkInput.placeholder = '渠道备注 (选填，如 生产主力/低延迟)';

    var actRow = document.createElement('div');
    actRow.className = 'a6-form-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'a6-btn-sm a6-btn-default';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', function () {
      addBox.style.display = 'none';
      idInput.value = '';
      nameInput.value = '';
      descInput.value = '';
      remarkInput.value = '';
    });

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'a6-btn-sm a6-btn-primary';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', function () {
      var cid = idInput.value.trim();
      var cname = nameInput.value.trim();
      var cdesc = descInput.value.trim();
      var cremark = remarkInput.value.trim();
      if (!cid) {
        idInput.focus();
        return;
      }
      if (!cname) cname = cid;

      var found = false;
      for (var idx = 0; idx < customList.length; idx++) {
        if (customList[idx].id === cid) {
          customList[idx].name = cname;
          customList[idx].desc = cdesc;
          found = true;
          break;
        }
      }
      if (!found) {
        customList.push({ id: cid, name: cname, desc: cdesc });
      }
      storageSet(STORAGE_KEY_CUSTOM, customList);
      if (cremark) {
        setChannelRemark(cid, cremark);
      }
      renderMarketDrawer(true);
    });

    actRow.appendChild(cancelBtn);
    actRow.appendChild(saveBtn);

    addBox.appendChild(idRow);
    addBox.appendChild(nameInput);
    addBox.appendChild(descInput);
    addBox.appendChild(remarkInput);
    addBox.appendChild(actRow);
    secCustom.appendChild(addBox);

    addToggleBtn.addEventListener('click', function () {
      addBox.style.display = addBox.style.display === 'none' ? 'flex' : 'none';
      if (addBox.style.display !== 'none') idInput.focus();
    });

    if (customList.length === 0) {
      var emptyCustomTip = document.createElement('div');
      emptyCustomTip.className = 'a6-empty-tip';
      emptyCustomTip.textContent = '暂无自定义渠道，点击右上角 + 添加';
      secCustom.appendChild(emptyCustomTip);
    } else {
      customList.forEach(function (ch, idx) {
        secCustom.appendChild(createChannelCard(ch, true, function () {
          customList.splice(idx, 1);
          storageSet(STORAGE_KEY_CUSTOM, customList);
          renderMarketDrawer(true);
        }));
      });
    }
    content.appendChild(secCustom);

    panel.appendChild(content);

    // 底部常驻设置栏
    var footer = document.createElement('div');
    footer.className = 'a6-drawer-footer';

    var footerRow1 = document.createElement('div');
    footerRow1.className = 'a6-footer-row1';

    var sideBtn = document.createElement('button');
    sideBtn.type = 'button';
    sideBtn.className = 'a6-toolbar-btn a6-drawer-tool-btn a6-btn-side';
    sideBtn.title = currentSide === 'right' ? '切换到左侧贴边' : '切换到右侧贴边';
    sideBtn.textContent = currentSide === 'right' ? '⇋ 靠左' : '⇋ 靠右';
    sideBtn.addEventListener('click', function () {
      currentSide = currentSide === 'right' ? 'left' : 'right';
      storageSet(STORAGE_KEY_DRAWER_SIDE, currentSide);
      renderMarketDrawer(true);
    });

    var autoLoadBtn = document.createElement('button');
    autoLoadBtn.type = 'button';
    autoLoadBtn.className = 'a6-toolbar-btn a6-btn-autoload';
    function updateAutoLoadBtn() {
      var isAuto = storageGet(STORAGE_KEY_AUTO_LOAD, false);
      if (isAuto) {
        autoLoadBtn.classList.add('is-active');
        autoLoadBtn.title = '触底自动加载更多: 已开启 (点击关闭)';
        autoLoadBtn.innerHTML = '<span>⚡ 自动加载: 开</span>';
      } else {
        autoLoadBtn.classList.remove('is-active');
        autoLoadBtn.title = '触底自动加载更多: 已关闭 (点击开启)';
        autoLoadBtn.innerHTML = '<span>⚡ 自动加载: 关</span>';
      }
    }
    updateAutoLoadBtn();
    autoLoadBtn.addEventListener('click', function () {
      var next = !storageGet(STORAGE_KEY_AUTO_LOAD, false);
      storageSet(STORAGE_KEY_AUTO_LOAD, next);
      updateAutoLoadBtn();
      syncAutoLoadObserver();
    });

    footerRow1.appendChild(sideBtn);
    footerRow1.appendChild(autoLoadBtn);
    footer.appendChild(footerRow1);

    // 页面宽度调节栏
    var widthBar = document.createElement('div');
    widthBar.className = 'a6-drawer-widthbar';

    var widthTop = document.createElement('div');
    widthTop.className = 'a6-width-top';

    var widthLabel = document.createElement('span');
    widthLabel.className = 'a6-width-label';
    widthLabel.textContent = '页面宽度';

    var currentWidth = storageGet(STORAGE_KEY_MARKET_WIDTH, 'default');
    var widthRight = document.createElement('div');
    widthRight.className = 'a6-width-input-wrap';

    var widthValDisplay = document.createElement('span');
    widthValDisplay.className = 'a6-width-val';
    function updateWidthDisplay(val) {
      if (val === 'default') widthValDisplay.textContent = '原版';
      else if (val === 'full') widthValDisplay.textContent = '100% 满宽';
      else widthValDisplay.textContent = val;
    }
    updateWidthDisplay(currentWidth);

    var numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.step = '0.05';
    numInput.min = '1.0';
    numInput.max = '3.0';
    numInput.className = 'a6-width-num-input';
    numInput.placeholder = '倍率';
    numInput.title = '直接输入放大倍率(如 1.35 或 1.55)，按回车生效';

    var numSuffix = document.createElement('span');
    numSuffix.className = 'a6-width-unit';
    numSuffix.textContent = 'x';

    function syncNumInput(val) {
      if (val === 'default') {
        numInput.value = '1.0';
        numInput.placeholder = '1.0';
      } else if (val === 'full') {
        numInput.value = '';
        numInput.placeholder = '满宽';
      } else {
        var n = parseFloat(val);
        numInput.value = isNaN(n) ? '' : String(n);
        numInput.placeholder = '倍率';
      }
    }
    syncNumInput(currentWidth);

    widthRight.appendChild(widthValDisplay);
    widthRight.appendChild(numInput);
    widthRight.appendChild(numSuffix);

    widthTop.appendChild(widthLabel);
    widthTop.appendChild(widthRight);

    var presetsWrap = document.createElement('div');
    presetsWrap.className = 'a6-width-presets';

    var presets = [
      { id: 'default', label: '原版' },
      { id: '1.35x', label: '1.35' },
      { id: '1.55x', label: '1.55' },
      { id: 'full', label: '满宽' },
    ];

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '100';
    slider.max = '180';
    slider.step = '5';
    slider.className = 'a6-width-slider';
    slider.title = '拖拽平滑调节宽度比例';

    function syncSlider(val) {
      if (val === 'default') slider.value = '100';
      else if (val === 'full') slider.value = '180';
      else {
        var n = parseFloat(val);
        slider.value = isNaN(n) ? '100' : String(Math.round(n * 100));
      }
    }
    syncSlider(currentWidth);

    var pillBtns = [];
    presets.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'a6-width-pill' + (currentWidth === p.id ? ' active' : '');
      btn.textContent = p.label;
      btn.addEventListener('click', function () {
        currentWidth = p.id;
        storageSet(STORAGE_KEY_MARKET_WIDTH, currentWidth);
        applyMarketWidth(currentWidth);
        updateWidthDisplay(currentWidth);
        syncSlider(currentWidth);
        syncNumInput(currentWidth);
        pillBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
      pillBtns.push(btn);
      presetsWrap.appendChild(btn);
    });

    function commitNumInput() {
      var raw = numInput.value.trim();
      if (!raw) {
        syncNumInput(currentWidth);
        return;
      }
      var n = parseFloat(raw);
      if (isNaN(n) || n < 0.8 || n > 3.0) {
        syncNumInput(currentWidth);
        return;
      }
      var newVal = (n === 1.0) ? 'default' : (n.toFixed(2).replace(/\.?0+$/, '') + 'x');
      currentWidth = newVal;
      storageSet(STORAGE_KEY_MARKET_WIDTH, currentWidth);
      applyMarketWidth(currentWidth);
      updateWidthDisplay(currentWidth);
      syncSlider(currentWidth);
      syncNumInput(currentWidth);
      pillBtns.forEach(function (b, idx) {
        if (presets[idx].id === newVal) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    numInput.addEventListener('input', function () {
      var raw = numInput.value.trim();
      var n = parseFloat(raw);
      if (!isNaN(n) && n >= 0.8 && n <= 3.0) {
        var newVal = (n === 1.0) ? 'default' : (n + 'x');
        currentWidth = newVal;
        storageSet(STORAGE_KEY_MARKET_WIDTH, currentWidth);
        applyMarketWidth(currentWidth);
        updateWidthDisplay(currentWidth);
        syncSlider(currentWidth);
        pillBtns.forEach(function (b, idx) {
          if (presets[idx].id === newVal) b.classList.add('active');
          else b.classList.remove('active');
        });
      }
    });

    numInput.addEventListener('change', commitNumInput);
    numInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        commitNumInput();
        numInput.blur();
      }
    });

    slider.addEventListener('input', function () {
      var num = parseInt(slider.value, 10);
      var newVal = (num === 100) ? 'default' : ((num === 180) ? 'full' : (num / 100).toFixed(2).replace(/\.?0+$/, '') + 'x');
      currentWidth = newVal;
      storageSet(STORAGE_KEY_MARKET_WIDTH, currentWidth);
      applyMarketWidth(currentWidth);
      updateWidthDisplay(currentWidth);
      syncNumInput(currentWidth);
      pillBtns.forEach(function (b, idx) {
        if (presets[idx].id === newVal) b.classList.add('active');
        else b.classList.remove('active');
      });
    });

    widthBar.appendChild(widthTop);
    widthBar.appendChild(presetsWrap);
    widthBar.appendChild(slider);
    footer.appendChild(widthBar);
    panel.appendChild(footer);
    container.appendChild(panel);
    if (savedScrollTop > 0) {
      content.scrollTop = savedScrollTop;
    }
    function setDrawerOpen(open) {
      isOpen = open;
      storageSet(STORAGE_KEY_DRAWER_OPEN, open);
      if (open) {
        panel.classList.add('is-open');
        trigger.classList.add('is-hidden');
      } else {
        panel.classList.remove('is-open');
        trigger.classList.remove('is-hidden');
      }
    }

    function createChannelCard(ch, isCustom, onDelete) {
      var card = document.createElement('div');
      card.className = 'a6-card' + (ch.id === activeChannelId ? ' active' : '') + (ch.delisted ? ' is-delisted' : '');
      card.setAttribute('data-cid', ch.id);

      var row1 = document.createElement('div');
      row1.className = 'a6-card-row1';

      var nameEl = document.createElement('span');
      nameEl.className = 'a6-card-name';
      nameEl.textContent = ch.name || ch.id;
      nameEl.title = ch.name || ch.id;

      var badges = document.createElement('div');
      badges.className = 'a6-card-badges';

      if (ch.delisted) {
        var delistedBadge = document.createElement('span');
        delistedBadge.className = 'a6-card-delisted';
        delistedBadge.textContent = '已下架';
        delistedBadge.title = '此渠道当前已无供应或已下架';
        badges.appendChild(delistedBadge);
      }
      var idBadge = document.createElement('span');
      idBadge.className = 'a6-card-id';
      idBadge.textContent = '#' + ch.id;
      badges.appendChild(idBadge);
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'a6-card-btn-icon a6-card-edit-btn';
      editBtn.title = '编辑备注';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var open = editBox.style.display !== 'none';
        editBox.style.display = open ? 'none' : 'flex';
        if (!open) {
          editInput.value = getChannelRemark(ch.id);
          setTimeout(function () { editInput.focus(); }, 50);
        }
      });
      badges.appendChild(editBtn);

      if (isCustom && onDelete) {
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'a6-card-del';
        delBtn.title = '删除此自定义渠道';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          onDelete();
        });
        badges.appendChild(delBtn);
      }

      row1.appendChild(nameEl);
      row1.appendChild(badges);
      card.appendChild(row1);

      if (ch.desc) {
        var descEl = document.createElement('div');
        descEl.className = 'a6-card-desc';
        descEl.textContent = ch.desc;
        descEl.title = ch.desc;
        card.appendChild(descEl);
      }

      var remark = getChannelRemark(ch.id);
      if (remark) {
        var remarkEl = document.createElement('div');
        remarkEl.className = 'a6-card-remark';
        remarkEl.textContent = '📝 ' + remark;
        remarkEl.title = '备注：' + remark;
        card.appendChild(remarkEl);
      }

      // 就地编辑备注输入框
      var editBox = document.createElement('div');
      editBox.className = 'a6-card-editbox';
      editBox.style.display = 'none';

      var editInput = document.createElement('input');
      editInput.className = 'a6-input a6-input-sm';
      editInput.placeholder = '输入备注（留空保存即删除）';
      editInput.value = remark || '';

      var editAct = document.createElement('div');
      editAct.className = 'a6-form-actions';

      var editCancel = document.createElement('button');
      editCancel.type = 'button';
      editCancel.className = 'a6-btn-sm a6-btn-default';
      editCancel.textContent = '取消';
      editCancel.addEventListener('click', function (ev) {
        ev.stopPropagation();
        editBox.style.display = 'none';
      });

      var editSave = document.createElement('button');
      editSave.type = 'button';
      editSave.className = 'a6-btn-sm a6-btn-primary';
      editSave.textContent = '保存';
      editSave.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setChannelRemark(ch.id, editInput.value.trim());
        renderMarketDrawer(true);
      });

      editInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      editInput.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          setChannelRemark(ch.id, editInput.value.trim());
          renderMarketDrawer(true);
        } else if (ev.key === 'Escape') {
          editBox.style.display = 'none';
        }
      });

      editAct.appendChild(editCancel);
      editAct.appendChild(editSave);
      editBox.appendChild(editInput);
      editBox.appendChild(editAct);
      card.appendChild(editBox);

      card.addEventListener('click', function () {
        if (activeChannelId === String(ch.id)) {
          clearMarketSearch();
        } else {
          performMarketSearch(ch.id);
          triggerPassiveSync(ch.id);
        }
      });

      return card;
    }
  }

  // 调度监听
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      if (location.hash.indexOf('#/merchant/channels') === 0) {
        scanRows();
        var c = document.getElementById('a6-drawer-container');
        if (c) c.style.display = 'none';
      } else if (location.hash.indexOf('#/market') === 0) {
        if (!document.getElementById('a6-drawer-panel')) {
          renderMarketDrawer();
        }
        updateMarketHighlights();
        applyMarketWidth(storageGet(STORAGE_KEY_MARKET_WIDTH, 'default'));
        syncAutoLoadObserver();
      }
    }, 250);
  }

  new MutationObserver(function (mutations) {
    if (!mutations || !mutations.length) {
      schedule();
      return;
    }
    var fromOutside = false;
    for (var i = 0; i < mutations.length; i++) {
      var target = mutations[i].target;
      if (!target) continue;
      if (target.id === 'a6-drawer-container' || (target.closest && target.closest('#a6-drawer-container'))) {
        continue;
      }
      fromOutside = true;
      break;
    }
    if (fromOutside) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', function () {
    if (location.hash.indexOf('#/market') === 0) {
      applyMarketWidth(storageGet(STORAGE_KEY_MARKET_WIDTH, 'default'));
      renderMarketDrawer(true);
      syncAutoLoadObserver();
    } else {
      applyMarketWidth('default');
      var c = document.getElementById('a6-drawer-container');
      if (c) c.style.display = 'none';
      syncAutoLoadObserver();
    }
    schedule();
  });

  document.addEventListener('input', function (ev) {
    if (location.hash.indexOf('#/market') !== 0) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains('ui-search-field')) {
      updateMarketHighlights();
    }
  }, true);

  document.addEventListener('click', function (ev) {
    if (location.hash.indexOf('#/market') !== 0) return;
    var tag = ev.target && ev.target.closest ? ev.target.closest('button.ui-switch-tag') : null;
    if (tag) {
      setTimeout(updateMarketHighlights, 50);
      return;
    }
    var tr = ev.target && ev.target.closest ? ev.target.closest('tr, [role="row"], .market-row') : null;
    if (tr) {
      setTimeout(updateMarketHighlights, 60);
      setTimeout(updateMarketHighlights, 200);
    }
  }, true);
  applyMarketWidth(storageGet(STORAGE_KEY_MARKET_WIDTH, 'default'));
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('切换市场触底自动加载', function () {
      var next = !storageGet(STORAGE_KEY_AUTO_LOAD, false);
      storageSet(STORAGE_KEY_AUTO_LOAD, next);
      renderMarketDrawer(true);
      syncAutoLoadObserver();
    });
  }
  syncAutoLoadObserver();
  schedule();
})();
