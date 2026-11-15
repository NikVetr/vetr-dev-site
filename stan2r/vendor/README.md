# Runtime and translator provenance

`R/` is an unchanged subset of [NikVetr/Stan2R](https://github.com/NikVetr/Stan2R/tree/e4f4b15), commit `e4f4b15`, implementing parsing of the typed AST, source mapping, translation, distributions, draws, and runtime helpers. `manifest.json` records SHA-256 hashes. Native subprocess/compiler discovery, plotting and model flattening are excluded; the host-specific bridge lives in `../core/bridge.R`. Stan2R has not declared a package license; no new license is assigned here to the author's code.

`stanc.js` is the official [stanc3 v2.38.0 JavaScript release](https://github.com/stan-dev/stanc3/releases/tag/v2.38.0), copied from the existing Stan2R hardening checkout's downloaded compiler. It uses the upstream BSD license in `STANC-LICENSE`. `package.json` marks this upstream script as CommonJS for the Node loader; the same file runs as a classic script in a browser worker.

The R WebAssembly runtime is loaded on demand from the official pinned URL `https://webr.r-wasm.org/v0.5.8/webr.mjs`; its binary runtime is not stored in this repository. See [webR documentation](https://docs.r-wasm.org/webr/v0.5.8/) for its runtime and licenses. Loader/network failures are reported, not replaced with another compiler or translator.
