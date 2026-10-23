# MCP Pro

A desktop Obsidian plugin that serves your vault to MCP clients over HTTP.

**0.4.0 preparation — unreleased.** These Role settings require the core 4.1.0 APIs. Core publication and a verified registry dependency/lockfile upgrade are still pending. The tracked dependency is deliberately unchanged until publication; this branch is not a ready-to-install release.

## Roles and tokens

Create a separately labeled token for each client and assign a Role. Six predefined Roles provide saved Tool selections: Full Access, Read only, Search only, Write only, Create only, and Append only. Custom Roles can be created, edited, or duplicated. Nine expandable categories show selection counts and mixed checkbox states. A Role assigned to tokens cannot be deleted until those tokens are reassigned or revoked.

Saving a shared Role names the affected tokens before applying the change. Tool edits, token reassignment, regeneration, and revocation close affected sessions; clients must initialize again. Name and label edits preserve sessions. Operations already executing are not rolled back.

Migration preserves an existing bearer token and assigns it to Full Access. An empty legacy bearer generates a random 256-bit token. Migration must save successfully before the endpoint can run. Existing version-2 Role snapshots never acquire newly introduced Tools automatically, including Full Access. Invalid or unsupported settings fail closed.

Tokens are masked until revealed. Copy Token and Copy Config place the secret on your clipboard. Regeneration and revocation require confirmation. Tokens are stored as plaintext in the vault's plugin settings; vault sync and backups may copy them. Masking does not encrypt this storage.

## Connection settings

Start and stop from settings, the ribbon, or the command palette. Auto-start is optional. The default bind address is loopback. Changing the bind address, port, or allowed hosts requires a restart; non-loopback binding exposes the endpoint to other devices that can reach that interface.

Additional allowed hosts describe destination `Host` headers, not client addresses. Entries are canonicalized to lowercase ASCII, with international domain names converted to punycode and IPv6 addresses enclosed in brackets. A bare host also permits its active server port; an explicit port permits that exact entry. The core retains its bind and loopback defaults. Invalid lines reject the entire edit. Detect Hosts only fills a draft after an explicit click; review and save it before use.

The Host settings draw on the behavior proposed in [PR #14](https://github.com/rps321321/obsidian-mcp-pro-plugin/pull/14), with a separately implemented validation helper. Canonicalization is this plugin's policy: the current core can accept an explicitly allowed uppercase Host entry.

## Permission boundaries

Roles select Tools; they do not create separate vaults or per-token folder boundaries. Global folder restrictions apply to every client. A read-only Role excludes `index_vault`; indexing can persist data or contact a configured provider. Searches can disclose note contents. Write operations can return affected text. Deletion is permanent, edits can destroy content, and moving a note may rewrite links in other notes. Review individual Tools before granting them.

Version-2 settings are unsupported by older plugin versions. Before downgrading, stop the endpoint and restore a matching settings backup together with the older plugin.

## Runtime and installation

The plugin requires an Obsidian installer with embedded Node.js 24 or newer. An application-only update can leave the older installer runtime in place. The plugin checks the runtime before loading or migrating settings. No separate Node installation is needed. The manifest's application API minimum does not establish embedded-runtime compatibility.

Native acceptance uses the official Obsidian 1.14.5 renderer with Node.js 24.22.0 and Electron 43.8.3, inside an isolated test bootstrap and synthetic vault. See [the validation record](docs/role-settings-validation.md) for coverage and limitations.

For a published release, copy `main.js`, `manifest.json`, and `styles.css` together into `<vault>/.obsidian/plugins/mcp-pro/`, then enable it in Community plugins. Source version metadata does not establish publication. This preparation branch still has the dependency gate described above.

## Development

Use Node.js 24 or newer. After the registry dependency upgrade, install with `npm ci`, then run:

```sh
npm run build
node scripts/test-backend.mjs
node --experimental-strip-types --test tests/hosts*.test.mjs
node scripts/test-settings-ui.mjs
```

Candidate verification currently installs a verified packed core artifact with `--no-save --package-lock=false`. That local installation is not a clean registry installation or a release; do not commit local tarball paths.

The plugin creates a fresh MCP server for each HTTP session and shares vault services through its manager. Settings changes are serialized with start and stop, saved before live authorization updates, and validated as immutable snapshots. See [authorization settings](docs/authorization-settings.md).

## License

MIT
