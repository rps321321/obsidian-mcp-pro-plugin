# Changelog

## 0.4.0 — Unreleased

- Use the published core 4.1.0 registry package and refresh compatible locked dependencies, including SDK 1.32.1, so the configured tool input budget is enforced.
- Pin esbuild to 0.25.12 to address [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The configured watch and rebuild paths do not invoke the affected HTTP development server. Failed watch builds now remove stale output until a successful rebuild restores it.
