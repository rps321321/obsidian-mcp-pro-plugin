# MCP Pro

A desktop Obsidian plugin that serves your vault to MCP clients over HTTP.

Published plugin [v0.4.0](https://github.com/rps321321/obsidian-mcp-pro-plugin/releases/tag/v0.4.0) bundles core 4.1.1, including its corrected SDK minimum. The registry lockfile and clean-built bundle have passed browser and isolated native Obsidian acceptance; see the [validation record](docs/role-settings-validation.md) for tested flows and limits.

## Connect a local client

1. Download `main.js`, `manifest.json`, and `styles.css` from the same [v0.4.0 release](https://github.com/rps321321/obsidian-mcp-pro-plugin/releases/tag/v0.4.0). Put them in `<vault>/.obsidian/plugins/mcp-pro/` and enable the plugin in Community plugins. Use an Obsidian installer with Node.js 24 or newer.
2. Open **Settings → MCP Pro**. Keep **Bind Address** at `127.0.0.1` for a client on this computer, and select an available port.
3. Create a labeled token with **Read only**, or another Role containing the Tools the client needs. Choose **Start** and check that the status is `running`.
4. Choose that token's **Copy Connection JSON…**. Add the configuration using the instructions for the actual client; this plugin does not configure clients automatically. The JSON includes a secret.
5. Connect the client, list its available Tools, and make a harmless call such as `get_vault_stats` if the Role permits it.

See [client setup and troubleshooting](docs/client-setup.md) for the generated JSON, client-specific documentation, remote-access prerequisites, and a development-only SDK connection check. SDK protocol checks are verified; Claude Desktop, Cursor, Claude Code, and ChatGPT have not been acceptance-tested as applications here.

These source instructions were updated after v0.4.0. Its released manifest still contains an older “no config-file editing” description. The revised source description is for a future build; no replacement v0.4.0 asset is implied.

## Roles and tokens

Create a separately labeled token for each client and assign a Role. Six predefined Roles provide saved Tool selections: Full Access, Read only, Search only, Write only, Create-only, and Append-only. Custom Roles can be created, edited, or duplicated. Nine expandable categories show selection counts and mixed checkbox states. A Role assigned to tokens cannot be deleted until those tokens are reassigned or revoked.

Saving a shared Role names the affected tokens before applying the change. Tool edits, token reassignment, regeneration, and revocation close affected sessions; clients must initialize again. Name and label edits preserve sessions. Operations already executing are not rolled back.

Migration preserves an existing bearer token and assigns it to Full Access. An empty legacy bearer generates a random 256-bit token. Migration must save successfully before the endpoint can run. Existing version-2 Role snapshots never acquire newly introduced Tools automatically, including Full Access. Invalid or unsupported settings fail closed.

Tokens are masked until revealed. Copy Token and Copy Connection JSON place the secret on your clipboard. Regeneration and revocation require confirmation. Tokens are stored as plaintext in the vault's plugin settings; vault sync and backups may copy them. Masking does not encrypt this storage.

## Connection settings

Start and stop from settings, the ribbon, or the command palette. Auto-start is optional. The default bind address is loopback. Changing the bind address, port, or allowed hosts requires a restart; non-loopback binding exposes the endpoint to other devices that can reach that interface.

Additional allowed hosts describe destination `Host` headers, not client addresses. Entries are canonicalized to lowercase ASCII, with international domain names converted to punycode and IPv6 addresses enclosed in brackets. A bare host also permits its active server port; an explicit port permits that exact entry. The core retains its bind and loopback defaults. Invalid lines reject the entire edit. Detect Hosts only fills a draft after an explicit click; review and save it before use.

The Host settings draw on the behavior proposed in [PR #14](https://github.com/rps321321/obsidian-mcp-pro-plugin/pull/14), with a separately implemented validation helper. Canonicalization is this plugin's policy: the current core can accept an explicitly allowed uppercase Host entry.

## Permission boundaries

Roles select Tools; they do not create separate vaults or per-token folder boundaries. Global folder restrictions apply to every client. A read-only Role excludes `index_vault`; indexing can persist data or contact a configured provider. Searches can disclose note contents. Write operations can return affected text. The `delete_note` Tool includes permanent deletion, edits can destroy content, and moving a note may rewrite links in other notes. Review individual Tools before granting them.

Version-2 settings are unsupported by older plugin versions. Before downgrading, stop the endpoint and restore a matching settings backup together with the older plugin.

## Runtime and installation

The plugin requires an Obsidian installer with embedded Node.js 24 or newer. An application-only update can leave the older installer runtime in place. The plugin checks the runtime before loading or migrating settings. No separate Node installation is needed. The manifest's application API minimum does not establish embedded-runtime compatibility.

Native acceptance uses the official Obsidian 1.14.5 renderer with Node.js 24.22.0 and Electron 43.8.3, inside an isolated test bootstrap and synthetic vault. See [the validation record](docs/role-settings-validation.md) for coverage and limitations.

For a published release, copy `main.js`, `manifest.json`, and `styles.css` together into `<vault>/.obsidian/plugins/mcp-pro/`, then enable it in Community plugins. Source version metadata does not establish publication of this plugin.

## Development

Use Node.js 24 or newer. Install the locked registry dependencies with `npm ci`, then run:

```sh
npm run build
node scripts/test-backend.mjs
node scripts/test-runtime.mjs
node --experimental-strip-types --test tests/hosts*.test.mjs
node scripts/test-settings-ui.mjs
```

The lockfile resolves core 4.1.1 and SDK 1.32.1 from npm. The [validation record](docs/role-settings-validation.md) includes final acceptance of the registry-built bundle and retains earlier packed-core and intermediate 4.1.0 verification separately as historical evidence.

CI tests the actual production `main.js` with temporary vaults and real MCP SDK clients. The harness replaces only Obsidian's host API and clipboard boundary; it checks sessions, credentials, copied connection JSON, restart behavior, and attachment resource bytes. It logs the tested artifact hash and locked core/SDK versions. This Node harness does not replace the separate native Obsidian release smoke test.

The development bundler is pinned to esbuild 0.25.12. The fixed [development-server advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) is not reached by this repository's configured `watch()` and `rebuild()` paths, which do not start esbuild's HTTP server. Since esbuild 0.25, a failed watch build removes stale output until a successful rebuild restores it.

The plugin creates a fresh MCP server for each HTTP session and shares vault services through its manager. Settings changes are serialized with start and stop, saved before live authorization updates, and validated as immutable snapshots. See [authorization settings](docs/authorization-settings.md).

## License

MIT
