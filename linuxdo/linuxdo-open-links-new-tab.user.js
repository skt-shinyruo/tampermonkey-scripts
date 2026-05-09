// ==UserScript==
// @name         Linux.do Open Links in New Tab
// @namespace    https://github.com/skt-shinyruo/tampermonkey-scripts
// @version      0.1.0
// @description  Open Linux.do topic links and eligible sidebar navigation links in new tabs.
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  if (window.location.hostname !== "linux.do") return;
  if (window.__linuxDoOpenLinksNewTabInstalled) return;
  window.__linuxDoOpenLinksNewTabInstalled = true;

  const TOPIC_PATH_RE = /^\/t\/topic\/\d+(?:\/\d+)?\/?$/;
  const SIDEBAR_LINK_SELECTOR = "#d-sidebar .sidebar-section-link[href]";

  function resolveUrl(value, baseUrl = "https://linux.do/") {
    try {
      return new URL(String(value || ""), baseUrl);
    } catch {
      return null;
    }
  }

  function isLinuxDoUrl(url) {
    return !!url && url.origin === "https://linux.do";
  }

  function collectAnchors(node) {
    if (!node) return [];
    if (node === document) return Array.from(document.querySelectorAll("a[href]"));
    if (node.nodeType !== 1) return [];
    if (node.matches?.("a[href]")) {
      return [node, ...node.querySelectorAll("a[href]")];
    }
    return Array.from(node.querySelectorAll?.("a[href]") || []);
  }

  function normalizeAnchor(anchor) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  function isFragmentOnlyHref(href) {
    return String(href || "").trim().startsWith("#");
  }

  function isExcludedSidebarPath(pathname) {
    return pathname.startsWith("/u/") || pathname === "/chat" || pathname.startsWith("/chat/");
  }

  function isLinuxDoTopicPage(url) {
    const resolved = resolveUrl(url);
    return isLinuxDoUrl(resolved) && TOPIC_PATH_RE.test(resolved.pathname);
  }

  function isLinuxDoTopicLink(href, baseUrl = "https://linux.do/") {
    const resolved = resolveUrl(href, baseUrl);
    return isLinuxDoUrl(resolved) && TOPIC_PATH_RE.test(resolved.pathname);
  }

  function isLinuxDoSidebarNavigationLink(anchor, baseUrl = "https://linux.do/") {
    if (!anchor?.matches?.(SIDEBAR_LINK_SELECTOR)) return false;

    const href = anchor.getAttribute("href");
    if (!href || isFragmentOnlyHref(href)) return false;

    const resolved = resolveUrl(href, baseUrl);
    return !!resolved && isLinuxDoUrl(resolved) && !isExcludedSidebarPath(resolved.pathname);
  }

  function shouldNormalizeAnchor(anchor, currentUrl) {
    return (
      isLinuxDoSidebarNavigationLink(anchor, currentUrl) ||
      (!isLinuxDoTopicPage(currentUrl) && isLinuxDoTopicLink(anchor.getAttribute("href"), currentUrl))
    );
  }

  function syncNode(node) {
    for (const anchor of collectAnchors(node)) {
      if (shouldNormalizeAnchor(anchor, window.location.href)) {
        normalizeAnchor(anchor);
      }
    }
  }

  function handleClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    if (!shouldNormalizeAnchor(anchor, window.location.href)) return;

    normalizeAnchor(anchor);
    event.stopImmediatePropagation();
  }

  document.addEventListener("click", handleClick, true);

  const observer = typeof MutationObserver === "function"
    ? new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            syncNode(node);
          }
        }
      })
    : null;

  observer?.observe(document.documentElement || document, { childList: true, subtree: true });
  syncNode(document);
})();
