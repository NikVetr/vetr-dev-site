# vetr.dev

The static site at https://vetr.dev, served by GitHub Pages with no build step. `index.html`, `style.css` and `assets/` are the landing page. Every tool or project lives in its own top-level folder with its own HTML, CSS, JavaScript and any tests, and the landing page links the public ones.

## Shared look

`shared/` holds what the newer tools (forecast-calibration, text-in-image, crossword, raster-to-vector) have in common, so their copies cannot drift apart:

- **`shared/base.css`**, linked before each tool's own `style.css`: the colour tokens for both themes, the page frame and two-column layout, cards, buttons and the `.file-button` file picker, inputs and the `[aria-invalid]` field style, the `.issues` problem list, the `.stale-banner` for a result that no longer matches its inputs, and the dialog with its sticky `.dialog-head`. A tool's `style.css` keeps only what is particular to it.
- **`shared/theme.js`**, a plain script in each page's `<head>`: one light or dark choice for the whole site, stored in this browser as `vetr:theme`, or else the system setting. It drives each tool's `#theme-toggle` and fires a `themechange` event for pages that draw in theme colours. The landing page loads it too, so it follows the same choice.

`sankey/` keeps its own denser visual language and stylesheet, and its tests serve its folder alone, so it does not link `shared/`.

To run it locally, serve the repository root and open http://localhost:8000/:

```sh
python3 -m http.server 8000
```

## Programmatic access

Tools that scripts and agents can use follow one shape. `forecast-calibration/` is the reference implementation.

- **`core/`** holds ES modules with no DOM access, importable from Node 22 and from the browser. Anything random uses a seeded generator, so results are reproducible.
- **`submit(request) → result`** is the single entry point. It takes JSON and returns JSON. It validates the request and rejects unknown fields. Problems throw one typed error with a `code`, a `message` and a list of `issues`, each `{code, path, message}`; input is never silently coerced. The tool's page calls the same function.
- **`window.<ToolName>`** in the page exposes `submit` and the page's exporters (for example SVG text or a PNG blob). Where the page computes in a worker, as `text-in-image/` does, its `submit` returns a Promise.
- **`cli.mjs`** runs as `node <tool>/cli.mjs request.json`, or reads the request from stdin. It prints the result JSON on stdout. Errors go to stderr as JSON, with exit status 1 for an invalid request and 2 for a usage problem. It needs Node only, with no npm install.
- **`api.md`** gives the request and result schema, the errors and one worked example.
- **`/llms.txt`** lists every tool that has an API and links its `api.md`. Add an entry there when a new tool gains one.

`intuitions/` is a gallery that puts several small entries behind one entry point: the request names the entry, `submit({entry, params}) → {entry, params, result}`, each entry's DOM-free core is `intuitions/<entry>/compute.js`, and the shared library (normal and bivariate-normal functions, seeded RNG, SVG plotting) is `intuitions/lib/`.

`sankey/` predates this shape. Its `window.SankeyApp.submit` needs the page's DOM, so its command line, `sankey/scripts/render.cjs`, drives headless Chromium through Playwright, and its errors carry only a message. `sankey/api.md` describes it.

Core tests run with `node --test` in the tool's folder. Browser smoke tests use Playwright where a tool has them, through `npm ci` or a `node_modules` link to an existing install.
