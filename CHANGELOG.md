# Changelog

## 0.4.0 — Unreleased

- Require published core 4.1.1 or newer within 4.x, including its corrected SDK minimum, and refresh compatible locked dependencies. The lockfile resolves SDK 1.32.1 so the configured tool input budget is enforced.
- Pin esbuild to 0.25.12 to address [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The configured watch and rebuild paths do not invoke the affected HTTP development server. Failed watch builds now remove stale output until a successful rebuild restores it.
