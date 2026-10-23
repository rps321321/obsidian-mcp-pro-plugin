import McpProPlugin from "../src/main";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TOOL_NAMES } from "obsidian-mcp-pro";
import { ServerManager } from "../src/server-manager";
import {
  DEFAULT_SETTINGS,
  TOOL_CATEGORIES,
  createPresetRoles,
  createToken,
  duplicateRole,
  getRoleTokens,
  loadSettingsData,
  removeRole,
  validateSettings,
  type Settings,
} from "../src/settings-model";

test("should match the core catalog exactly and preserve the predefined role boundaries", () => {
  const categories = TOOL_CATEGORIES.flatMap((group) => group.tools);
  assert.equal(new Set(categories).size, categories.length);
  assert.deepEqual([...categories].sort(), [...TOOL_NAMES].sort());
  const presets = createPresetRoles();
  assert.equal(presets.length, 6);
  assert.deepEqual(presets.find((r) => r.id === "full-access")!.tools, [
    ...TOOL_NAMES,
  ]);
  assert.deepEqual(presets.find((r) => r.id === "create-only")!.tools, [
    "create_note",
    "create_daily_note",
  ]);
  assert.deepEqual(presets.find((r) => r.id === "append-only")!.tools, [
    "append_to_note",
  ]);
  assert.deepEqual(presets.find((r) => r.id === "search-only")!.tools, [
    "search_notes",
    "search_by_frontmatter",
    "search_by_tag",
    "search_semantic",
    "find_similar_notes",
    "query_base",
  ]);
  assert.deepEqual(presets.find((r) => r.id === "write-only")!.tools, [
    "create_note",
    "create_daily_note",
    "append_to_note",
    "prepend_to_note",
    "update_frontmatter",
    "update_section",
    "insert_at_section",
    "edit_block",
    "replace_in_note",
    "rename_tag",
    "add_canvas_node",
    "add_canvas_edge",
  ]);
  const mutations = [
    "create_note",
    "create_daily_note",
    "append_to_note",
    "prepend_to_note",
    "update_frontmatter",
    "move_note",
    "delete_note",
    "update_section",
    "insert_at_section",
    "edit_block",
    "replace_in_note",
    "rename_tag",
    "add_canvas_node",
    "add_canvas_edge",
    "index_vault",
  ];
  assert.deepEqual(
    [...presets.find((r) => r.id === "read-only")!.tools].sort(),
    TOOL_NAMES.filter((name) => !mutations.includes(name)).sort(),
  );
});

test("should migrate a legacy bearer once and persist explicit Full Access names", () => {
  const first = loadSettingsData({
    bearerToken: " existing-secret ",
    host: "127.0.0.1",
    port: 4310,
    autoStart: true,
    vaultName: "Notes",
  });
  assert.equal(first.migrated, true);
  assert.equal(first.settings.tokens[0]!.token, "existing-secret");
  assert.equal(first.settings.tokens[0]!.roleId, "full-access");
  assert.equal(first.settings.autoStart, true);
  assert.equal(Object.hasOwn(first.settings, "bearerToken"), false);
  const second = loadSettingsData(JSON.parse(JSON.stringify(first.settings)));
  assert.equal(second.migrated, false);
  assert.deepEqual(second.settings, first.settings);
});

test("should generate a fresh 256-bit token when a legacy install has no bearer", () => {
  const first = loadSettingsData(null),
    second = loadSettingsData({ bearerToken: "" });
  assert.match(first.settings.tokens[0]!.token, /^[a-f0-9]{64}$/);
  assert.notEqual(
    first.settings.tokens[0]!.token,
    second.settings.tokens[0]!.token,
  );
  assert.notEqual(first.settings.tokens[0]!.id, second.settings.tokens[0]!.id);
});

test("should retain saved Full Access snapshots when the current catalog has additional tools", () => {
  const saved = {
    ...DEFAULT_SETTINGS,
    roles: [{ id: "full-access", name: "Full Access", tools: ["get_note"] }],
    tokens: [createToken("Reader", "full-access")],
  };
  const loaded = loadSettingsData(saved);
  assert.equal(loaded.migrated, false);
  assert.deepEqual(loaded.settings.roles[0]!.tools, ["get_note"]);
  assert(TOOL_NAMES.includes("delete_note"));
  assert.equal(loaded.settings.roles.length, 1);
});

test("should reject malformed or partial saved roles instead of granting Full Access", () => {
  const fresh = loadSettingsData(null).settings;
  for (const invalid of [
    { roles: [], tokens: [] },
    { ...fresh, schemaVersion: 3 },
    { ...fresh, roles: [] },
    {
      ...fresh,
      roles: [{ id: "full-access", name: "Bad", tools: ["nonexistent"] }],
    },
    { ...fresh, tokens: [...fresh.tokens, ...fresh.tokens] },
    { ...fresh, roles: [...fresh.roles, ...fresh.roles] },
    { ...fresh, tokens: [{ ...fresh.tokens[0], roleId: "missing" }] },
    { ...fresh, allowedHosts: ["https://evil.example/path"] },
    { ...fresh, tokens: new Array(1) },
  ])
    assert.throws(() => loadSettingsData(invalid));
});

test("should reject assigned-role removal and duplicate without sharing mutable tool arrays", () => {
  const settings = loadSettingsData(null).settings;
  assert.equal(getRoleTokens(settings, "full-access").length, 1);
  assert.throws(
    () => removeRole(settings, "full-access"),
    /Reassign or revoke/,
  );
  const copy = duplicateRole(settings.roles[0]!, "Custom copy");
  assert.notEqual(copy.id, settings.roles[0]!.id);
  assert.deepEqual(copy.tools, settings.roles[0]!.tools);
  assert.notEqual(copy.tools, settings.roles[0]!.tools);
  assert.equal(
    removeRole({ ...settings, tokens: [] }, "full-access").roles.length,
    5,
  );
  assert.throws(() => {
    (settings.roles[0]!.tools as string[]).push("delete_note");
  }, TypeError);
});

async function fixture(
  run: (context: {
    manager: ServerManager;
    read: Client;
    write: Client;
    readTransport: StreamableHTTPClientTransport;
    writeTransport: StreamableHTTPClientTransport;
    vault: string;
    getSettings: () => Settings;
    save: (change: (current: Settings) => Settings) => Promise<void>;
    request: (
      token: string,
      sid: string | undefined,
      method?: string,
    ) => Promise<Response>;
  }) => Promise<void>,
) {
  const vault = await mkdtemp(join(tmpdir(), "obsidian-plugin-roles-"));
  await writeFile(join(vault, "note.md"), "original content");
  let settings = validateSettings({
    ...DEFAULT_SETTINGS,
    port: 0,
    roles: [
      { id: "reader", name: "Reader", tools: ["get_note"] },
      { id: "writer", name: "Writer", tools: ["append_to_note"] },
    ],
    tokens: [
      {
        id: "r",
        label: "Read client",
        token: "reader-secret",
        roleId: "reader",
      },
      {
        id: "w",
        label: "Write client",
        token: "writer-secret",
        roleId: "writer",
      },
    ],
  });
  const manager = new ServerManager(vault, () => settings);
  const clients: Client[] = [];
  try {
    await Promise.all([manager.start(), manager.start()]);
    const url = manager.getState().url!;
    const connect = async (token: string) => {
      const client = new Client({ name: "plugin-backend", version: "1" });
      clients.push(client);
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      await client.connect(transport);
      return { client, transport };
    };
    const read = await connect("reader-secret"),
      write = await connect("writer-secret");
    const save = (change: (current: Settings) => Settings) =>
      manager.updateSettings(change, async (next) => {
        await writeFile(join(vault, "saved.json"), JSON.stringify(next));
        settings = next;
      });
    const request = (
      token: string,
      sid: string | undefined,
      method = "tools/list",
    ) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(sid ? { "Mcp-Session-Id": sid } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
      });
    await run({
      manager,
      read: read.client,
      write: write.client,
      readTransport: read.transport,
      writeTransport: write.transport,
      vault,
      getSettings: () => settings,
      save,
      request,
    });
  } finally {
    await Promise.all(
      clients.map((client) => client.close().catch(() => undefined)),
    );
    await manager.stop();
    await rm(vault, { recursive: true, force: true });
  }
}

test("should serve two isolated real HTTP sessions through the source-bundled manager", () =>
  fixture(
    async ({ read, write, readTransport, writeTransport, vault, request }) => {
      assert.deepEqual(
        (await read.listTools()).tools.map((tool) => tool.name),
        ["get_note"],
      );
      assert.deepEqual(
        (await write.listTools()).tools.map((tool) => tool.name),
        ["append_to_note"],
      );
      assert.notEqual(readTransport.sessionId, writeTransport.sessionId);
      assert.equal(
        (await request("writer-secret", readTransport.sessionId)).status,
        401,
      );
      await assert.rejects(
        read.callTool({
          name: "append_to_note",
          arguments: { path: "note.md", content: "unauthorized" },
        }),
        /not found/i,
      );
      assert.equal(
        await readFile(join(vault, "note.md"), "utf8"),
        "original content",
      );
      await write.callTool({
        name: "append_to_note",
        arguments: { path: "note.md", content: "allowed" },
      });
      assert.match(await readFile(join(vault, "note.md"), "utf8"), /allowed/);
    },
  ));

test("should apply revocation and role edits immediately while labels preserve sessions", () =>
  fixture(
    async ({ read, writeTransport, readTransport, save, request, vault }) => {
      const sid = readTransport.sessionId;
      await save((current) => ({
        ...current,
        tokens: current.tokens.map((token) => ({ ...token, label: "Renamed" })),
        roles: current.roles.map((role) => ({ ...role, name: "Renamed role" })),
      }));
      assert.equal((await request("reader-secret", sid)).status, 200);
      assert.equal(readTransport.sessionId, sid);
      await save((current) => ({
        ...current,
        tokens: current.tokens.filter((token) => token.id !== "w"),
      }));
      assert.equal(
        (await request("writer-secret", writeTransport.sessionId)).status,
        401,
      );
      assert.deepEqual(
        (await read.listTools()).tools.map((tool) => tool.name),
        ["get_note"],
      );
      await save((current) => ({
        ...current,
        roles: current.roles.map((role) =>
          role.id === "reader" ? { ...role, tools: [] } : role,
        ),
      }));
      assert.notEqual((await request("reader-secret", sid)).status, 200);
      assert.deepEqual(
        JSON.parse(await readFile(join(vault, "saved.json"), "utf8")).roles[0]
          .tools,
        [],
      );
    },
  ));

test("should leave live settings and authorization unchanged when persistence fails", () =>
  fixture(async ({ manager, getSettings, read, readTransport, request }) => {
    const before = getSettings();
    await assert.rejects(
      manager.updateSettings(
        (current) => ({ ...current, tokens: [] }),
        async () => {
          throw new Error("disk full");
        },
      ),
      /MCP settings could not be saved/,
    );
    assert.equal(getSettings(), before);
    assert.equal(
      (await request("reader-secret", readTransport.sessionId)).status,
      200,
    );
    assert.deepEqual(
      (await read.listTools()).tools.map((tool) => tool.name),
      ["get_note"],
    );
  }));

test("should serialize settings transforms with start and stop", async () => {
  const vault = await mkdtemp(join(tmpdir(), "obsidian-plugin-queue-"));
  let settings = validateSettings({
    ...loadSettingsData(null).settings,
    port: 0,
  });
  const manager = new ServerManager(vault, () => settings);
  let entered!: () => void, release!: () => void;
  const saving = new Promise<void>((resolve) => (entered = resolve)),
    gate = new Promise<void>((resolve) => (release = resolve));
  try {
    const first = manager.updateSettings(
      (current) => ({ ...current, vaultName: "first" }),
      async (next) => {
        entered();
        await gate;
        settings = next;
      },
    );
    await saving;
    const second = manager.updateSettings(
      (current) => ({ ...current, autoStart: true }),
      async (next) => {
        settings = next;
      },
    );
    const start = manager.start(),
      stop = manager.stop();
    release();
    await Promise.all([first, second, start, stop]);
    assert.equal(settings.vaultName, "first");
    assert.equal(settings.autoStart, true);
    assert.equal(manager.getState().status, "stopped");
  } finally {
    await manager.stop();
    await rm(vault, { recursive: true, force: true });
  }
});

test("should retain saved revocation when runtime closure fails and report an error", () =>
  fixture(async ({ manager, save, request, writeTransport, getSettings }) => {
    const handle = (
      manager as unknown as {
        handle: {
          updateAuthorization: (options: unknown) => Promise<void>;
          stop: () => Promise<void>;
        };
      }
    ).handle;
    const runtimeErrors: unknown[][] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      runtimeErrors.push(args);
    };
    const update = handle.updateAuthorization.bind(handle),
      stop = handle.stop.bind(handle);
    handle.updateAuthorization = async (options) => {
      await update(options);
      throw new Error("synthetic-bearer-never-display transport close failure");
    };
    handle.stop = async () => {
      throw new Error("synthetic-bearer-never-display stop failure");
    };
    try {
      await assert.rejects(
        save((current) => ({
          ...current,
          tokens: current.tokens.filter((token) => token.id !== "w"),
        })),
        /Saved MCP settings could not be applied/,
      );
      assert.equal(manager.getState().status, "error");
      assert(
        !JSON.stringify([
          runtimeErrors,
          manager.getState(),
          (globalThis as unknown as { __mcpTestNotices: string[] })
            .__mcpTestNotices,
        ]).includes("synthetic-bearer-never-display"),
      );
      assert.equal(getSettings().tokens.length, 1);
      assert.equal(
        (await request("writer-secret", writeTransport.sessionId)).status,
        401,
      );
    } finally {
      console.error = originalConsoleError;
      handle.stop = stop;
      handle.updateAuthorization = update;
    }
  }));

test("should persist migration before exposing settings and fail plugin load if that write fails", async () => {
  const plugin = new McpProPlugin();
  const legacy = { bearerToken: "preserved", autoStart: true };
  let writes = 0;
  plugin.loadData = async () => legacy;
  plugin.saveData = async () => {
    writes++;
    throw new Error("settings storage unavailable");
  };
  await assert.rejects(
    plugin.onload(),
    /MCP settings could not be loaded or migrated/,
  );
  assert.equal(writes, 1);
  assert.deepEqual(plugin.settings.tokens, []);
  let saved: unknown;
  plugin.saveData = async (next) => {
    assert.deepEqual(plugin.settings.tokens, []);
    saved = next;
  };
  await plugin.loadSettings();
  assert.equal(plugin.settings.tokens[0]!.token, "preserved");
  assert.equal(saved, plugin.settings);
  plugin.loadData = async () => saved;
  plugin.saveData = async () => {
    throw new Error("must not rewrite v2");
  };
  await plugin.loadSettings();
  assert.equal(plugin.settings.tokens[0]!.token, "preserved");
});

test("should commit main settings only after persistence resolves", async () => {
  const vault = await mkdtemp(join(tmpdir(), "plugin-main-settings-"));
  const plugin = new McpProPlugin();
  plugin.settings = loadSettingsData(null).settings;
  const manager = new ServerManager(vault, () => plugin.settings);
  (plugin as unknown as { manager: ServerManager }).manager = manager;
  try {
    const before = plugin.settings;
    plugin.saveData = async () => {
      throw new Error("write failed");
    };
    await assert.rejects(
      plugin.updateSettings((current) => ({
        ...current,
        vaultName: "unsaved",
      })),
      /MCP settings could not be saved/,
    );
    assert.equal(plugin.settings, before);
    plugin.saveData = async (next) => {
      assert.equal(plugin.settings, before);
      assert.equal(next.vaultName, "saved");
    };
    await plugin.updateSettings((current) => ({
      ...current,
      vaultName: "saved",
    }));
    assert.equal(plugin.settings.vaultName, "saved");
    assert(Object.isFrozen(plugin.settings));
  } finally {
    await manager.stop();
    await rm(vault, { recursive: true, force: true });
  }
});

test("should redact injected secrets from failure promises, notices, state and logs", async () => {
  const marker = "synthetic-bearer-never-display";
  const output: unknown[][] = [];
  const originalError = console.error;
  const notices = globalThis as unknown as { __mcpTestNotices: string[] };
  notices.__mcpTestNotices = [];
  console.error = (...args: unknown[]) => {
    output.push(args);
  };
  const vault = await mkdtemp(join(tmpdir(), "plugin-errors-"));
  const settings = loadSettingsData(null).settings;
  const manager = new ServerManager(vault, () => {
    throw new Error(marker);
  });
  const safeRejection = (error: unknown): boolean => {
    assert(error instanceof Error);
    assert(!String(error).includes(marker));
    assert.equal(error.cause, undefined);
    return true;
  };
  try {
    await assert.rejects(manager.start(), safeRejection);
    const normal = new ServerManager(vault, () => settings);
    await assert.rejects(
      normal.updateSettings(
        (current) => current,
        async () => {
          throw new Error(marker);
        },
      ),
      safeRejection,
    );
    const plugin = new McpProPlugin();
    plugin.loadData = async () => {
      throw new Error(marker);
    };
    await assert.rejects(plugin.loadSettings(), safeRejection);
    assert(
      !JSON.stringify([
        output,
        notices.__mcpTestNotices,
        manager.getState(),
      ]).includes(marker),
    );
  } finally {
    console.error = originalError;
    await rm(vault, { recursive: true, force: true });
  }
});

test("should reject an unsupported runtime before migration and continue on Node 24", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  const vault = await mkdtemp(join(tmpdir(), "plugin-node-gate-"));
  const plugin = new McpProPlugin();
  let loads = 0,
    saves = 0,
    tabs = 0;
  plugin.loadData = async () => {
    loads++;
    return { bearerToken: "legacy-preserved" };
  };
  plugin.saveData = async () => {
    saves++;
  };
  Object.assign(plugin, {
    resolveVaultPath: () => vault,
    addSettingTab: () => {
      tabs++;
    },
    addRibbonIcon: () => undefined,
    addStatusBarItem: () => ({ setText: () => undefined }),
    addCommand: () => undefined,
  });
  try {
    Object.defineProperty(process.versions, "node", {
      ...descriptor,
      value: "22.23.2",
    });
    await assert.rejects(
      plugin.onload(),
      /requires an Obsidian installer with Node.js 24 or newer/,
    );
    assert.deepEqual([loads, saves, tabs], [0, 0, 0]);
    assert.equal(
      (plugin as unknown as { manager?: ServerManager }).manager,
      undefined,
    );
    assert.deepEqual(plugin.settings.tokens, []);
    Object.defineProperty(process.versions, "node", {
      ...descriptor,
      value: "24.22.0",
    });
    await plugin.onload();
    assert.deepEqual([loads, saves, tabs], [1, 1, 1]);
    assert.equal(plugin.settings.tokens[0]!.token, "legacy-preserved");
    const manager = (plugin as unknown as { manager: ServerManager }).manager;
    assert.equal(manager.getState().status, "stopped");
    await manager.stop();
  } finally {
    Object.defineProperty(process.versions, "node", descriptor);
    await rm(vault, { recursive: true, force: true });
  }
});
