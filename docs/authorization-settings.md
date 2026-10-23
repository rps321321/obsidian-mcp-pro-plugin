# Persisted HTTP authorization

The plugin stores settings with `schemaVersion: 2`. Each Role has `id`, `name`, and an explicit `tools` array. Each token has `id`, `label`, `token`, and `roleId`.

Loading an older single-token configuration creates six predefined Roles and assigns the existing bearer to Full Access. If the old bearer is empty, migration generates 32 cryptographically random bytes encoded as hex. The migration is saved before the server or settings tab can start. A failed save aborts plugin loading. A valid version-2 configuration is loaded without regenerating tokens or extending Role snapshots. Unknown versions, partial Role settings without a version, missing Role assignments, duplicate identifiers or tokens, and unknown Tool names reject loading.

Full Access is a saved list of names. Its name and ID do not grant newly introduced Tools. Read only excludes `index_vault` and all mutation Tools. The nine category lists are checked against the actual core catalog by the backend tests. Removing an assigned Role requires explicit token reassignment or revocation first. Duplicating a Role creates a new ID and an independent Tool list.

The settings tab calls `plugin.updateSettings(change)` with a function from the current immutable Settings object to a new candidate. The manager serializes that operation with start and stop. It validates and copies the candidate, saves it, commits the in-memory Settings object, and applies the core authorization update. A save failure leaves current settings and live authorization unchanged. Role edits, reassignment, and revocation close affected sessions. Name and label edits preserve sessions because they do not change authorization.

If the runtime update fails after saving, the manager attempts to stop the endpoint and reports an error. The core replaces its authorization map before awaiting transport closure, so an unsuccessful close does not restore revoked access. A failed stop retains its handle for a later retry. Operations already executing are not rolled back. Storage and runtime failures cross the plugin boundary as fixed category messages; original exception messages and causes are not placed in notices, logs, or rejected promises, because they may contain credentials.

Host and port changes require a restart. Additional allowed hosts are canonicalized and expanded through `hosts.ts`; the core retains its bind and loopback defaults. One manager owns shared MCP services for its vault, while every initialized HTTP session receives a fresh MCP server with that token's resolved Tool list.

## Runtime requirement

The plugin requires an Obsidian installer whose embedded Node.js runtime is version 24 or newer. The plugin checks this before loading or migrating settings, creating the server manager, or registering its UI. Updating the Obsidian application alone may not update its installer runtime. The manifest retains its existing application API minimum; that minimum does not establish runtime compatibility.

The isolated native acceptance environment uses Obsidian 1.14.5, Node.js 24.22.0, and Electron 43.8.3. The backend harness also substitutes the reported runtime version to verify that Node 22 is rejected before any settings load or save and Node 24 proceeds. This substitution is a gate test, not execution on Node 22.

## Verification and release dependency

Run `node scripts/test-backend.mjs`. The harness minifies and bundles the real manager, settings model, and installed core with the production Node target. It uses real HTTP clients and a temporary vault. The Obsidian Notice class and the settings-tab import are replaced only in this harness. Tests cover migration persistence, presets, snapshot preservation, denied writes, token/session binding, live revocation, serialized saves, and injected save/closure failures. This does not establish behavior inside the native Obsidian application.

This integration requires core APIs `TOOL_NAMES`, `createMcpServerServices`, Role-aware `startHttpServer`, and `updateAuthorization`. Development verification uses the actual packed core 4.1.0 candidate. The plugin's tracked dependency must be updated only after that core version is published and verified in the registry; a local tarball installation is not a completed release. The persisted version-2 format is not supported by older plugin versions.
