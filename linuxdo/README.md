# Linux.do Open Links in New Tab

This userscript opens Linux.do topic links and eligible sidebar navigation links in new tabs.

## Features

- Opens topic links in new tabs outside topic pages.
- Opens eligible sidebar navigation links in new tabs.
- Keeps a guard so it only activates on `linux.do`.

## Source and build output

- Source file: `linuxdo/linuxdo-open-links-new-tab.user.js`
- Build script: `linuxdo/build-userscript.mjs`
- GitHub Pages artifact: `https://skt-shinyruo.github.io/tampermonkey-scripts/linuxdo-open-links-new-tab.user.js`
- Greasy Fork script page: `https://greasyfork.org/zh-CN/scripts/577195-linux-do-open-links-in-new-tab`

## Build

```bash
node linuxdo/build-userscript.mjs
LINUXDO_UPDATE_URL="https://skt-shinyruo.github.io/tampermonkey-scripts/linuxdo-open-links-new-tab.user.js" \
LINUXDO_DOWNLOAD_URL="https://skt-shinyruo.github.io/tampermonkey-scripts/linuxdo-open-links-new-tab.user.js" \
node linuxdo/build-userscript.mjs --output=dist/linuxdo-open-links-new-tab.user.js
```

## Validation

```bash
node --check linuxdo/linuxdo-open-links-new-tab.user.js
node --check linuxdo/build-userscript.mjs
node --test linuxdo/linuxdo-open-links-new-tab.user.test.mjs
```

Greasy Fork sync uses the raw GitHub source file, and the existing webhook updates the script after each push.
