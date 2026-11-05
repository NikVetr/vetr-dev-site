# vetr.dev

The static site at https://vetr.dev, served by GitHub Pages with no build step. `index.html`, `style.css` and `assets/` are the landing page. Every tool or project lives in its own top-level folder with its own HTML, CSS, JavaScript and any tests, and the landing page links the public ones.

To run it locally, serve the repository root and open http://localhost:8000/:

```sh
python3 -m http.server 8000
```

## Programmatic access

Tools that scripts and agents can use follow one shape. `forecast-calibration/` is the reference implementation.

- **`core/`** holds ES modules with no DOM access, importable from Node 22 and from the browser. Anything random uses a seeded generator, so results are reproducible.
- **`submit(request) → result`** is the single entry point. It takes JSON and returns JSON. It validates the request and rejects unknown fields. Problems throw one typed error with a `code`, a `message` and a list of `issues`, each `{code, path, message}`; input is never silently coerced. The tool's page calls the same function.
- **`window.<ToolName>`** in the page exposes `submit` and the page's exporters (for example SVG text or a PNG blob).
- **`cli.mjs`** runs as `node <tool>/cli.mjs request.json`, or reads the request from stdin. It prints the result JSON on stdout. Errors go to stderr as JSON, with exit status 1 for an invalid request and 2 for a usage problem. It needs Node only, with no npm install.
- **`api.md`** gives the request and result schema, the errors and one worked example.
- **`/llms.txt`** lists every tool that has an API and links its `api.md`. Add an entry there when a new tool gains one.

Core tests run with `node --test` in the tool's folder. Browser smoke tests use Playwright where a tool has them, through `npm ci` or a `node_modules` link to an existing install.
