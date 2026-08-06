# A6API Fixed 6.95 Exchange Rate

This userscript adds a second multiplier to each merchant row on the A6API model market. The blue value uses a fixed exchange rate of `6.95`:

```text
merchant input price / official input price * 6.95
```

For example, `$0.0564 / $5.000 * 6.95` is displayed as `0.0784`.

The script supports desktop rows, collapsed mobile cards, model filtering, pagination, refreshes, and currency changes. When exact official and merchant prices are present in the row, it reads those values directly. A collapsed mobile card uses the site's displayed multiplier and declared current exchange rate as the mathematically equivalent fallback until its price details are available.

A6API serves the initial document from `/` and switches to `/models` with client-side routing. The userscript therefore matches the whole A6API origin, but it only changes the page while the active route is the model market.

## Source and build output

- Source: `a6api/a6api-fixed-exchange-rate.user.js`
- Build script: `a6api/build-userscript.mjs`
- GitHub Pages artifact: `https://skt-shinyruo.github.io/tampermonkey-scripts/a6api-fixed-exchange-rate.user.js`

## Validation

```bash
node --check a6api/a6api-fixed-exchange-rate.user.js
node --check a6api/build-userscript.mjs
node --test a6api/a6api-fixed-exchange-rate.user.test.mjs
```
