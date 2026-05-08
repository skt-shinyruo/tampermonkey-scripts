# Sub2API Helper Source

`sub2api-helper.user.js` is the generated Tampermonkey userscript.
Edit the ordered files in `src/parts/`, then rebuild with:

```bash
node sub2api/build-userscript.mjs
```

Check that the generated userscript is current with:

```bash
node sub2api/build-userscript.mjs --check
```

The parts intentionally share one userscript closure. This keeps the refactor low-risk while making each feature area smaller to edit.
