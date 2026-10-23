# Changelog

## Unreleased

- Add CI acceptance against the actual production `main.js`, including concurrent MCP clients, copied connection JSON, authentication, port collisions, restart and session cleanup, and byte-identical PDF/DOCX resource responses. Keep native Obsidian acceptance separate from the Node host harness.

## 0.4.0 — 2026-10-23

- Add shared Roles with six predefined selections, custom Role creation and duplication, and nine expandable Tool categories with mixed checkbox states. Shared permission edits identify affected tokens before saving.
- Add labeled, Role-assigned tokens with masked secrets, deliberate reveal/copy, regeneration and revocation. Permission changes invalidate affected sessions; settings explain unencrypted token storage.
- Validate and canonicalize additional allowed Hosts, with explicit machine detection and restart guidance. Failed settings saves preserve the previous configuration.
- Require a Node 24 or newer Obsidian runtime and report unsupported runtimes before starting the endpoint.
- Require published core 4.1.1 or newer within 4.x, including its corrected SDK minimum, and refresh compatible locked dependencies. The lockfile resolves SDK 1.32.1 so the configured tool input budget is enforced.
- Pin esbuild to 0.25.12 to address [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The configured watch and rebuild paths do not invoke the affected HTTP development server. Failed watch builds now remove stale output until a successful rebuild restores it.
