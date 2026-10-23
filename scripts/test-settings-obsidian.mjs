import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runUiChecks } from "../tests/settings-ui.test.mjs";

const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
  : await import("playwright");
if (!process.env.OBSIDIAN_UI_CDP)
  throw new Error("Set OBSIDIAN_UI_CDP to the isolated test app endpoint.");
const browser = await chromium.connectOverCDP(process.env.OBSIDIAN_UI_CDP);
const observed = new Set([
  "click",
  "fill",
  "check",
  "uncheck",
  "selectOption",
  "press",
  "focus",
  "setViewportSize",
]);
let snapshots = 0;
let initial;
let main;
try {
  main = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url().startsWith("app://obsidian.md/"));
  assert.ok(main, "Official Obsidian renderer must be open.");
  main.setDefaultTimeout(10_000);
  const identity = await main.evaluate(() => ({
    vault: app.vault.adapter.getBasePath(),
    profile: require("@electron/remote").app.getPath("userData"),
    version: process.versions,
  }));
  assert.match(identity.vault, /[\\/]ui-runtime[\\/]vault-role-settings$/);
  assert.equal(
    identity.profile,
    join(dirname(identity.vault), "profile-role-settings"),
  );
  initial = await main.evaluate(() => app.plugins.plugins["mcp-pro"].settings);
  await main.evaluate(async () => {
    window.__uiCopied = "";
    const writeText = async (text) => {
      window.__uiCopied = text;
    };
    writeText.__roleUiIntercept = true;
    const nativeNavigator = navigator;
    const clipboard = {
      writeText,
      readText: async () => {
        throw new Error("System clipboard reads are forbidden.");
      },
    };
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: new Proxy(nativeNavigator, {
        get(target, name) {
          if (name === "clipboard") return clipboard;
          const value = Reflect.get(target, name, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    });
    if (navigator.clipboard.writeText !== writeText)
      throw new Error("Main clipboard interception failed.");
    const plugin = app.plugins.plugins["mcp-pro"];
    const token = (label) => ({
      id: crypto.randomUUID(),
      label,
      token: require("node:crypto").randomBytes(32).toString("hex"),
      roleId: "read-only",
    });
    await plugin.updateSettings((current) => ({
      ...current,
      tokens: [token("Agent one"), token("Agent two")],
    }));
    app.setting.openTabById("mcp-pro");
  });
  const page = (
    await Promise.all(
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .map(async (page) => ({ page, title: await page.title() })),
    )
  ).find((item) =>
    item.title.startsWith("Settings - vault-role-settings - "),
  )?.page;
  assert.ok(page, "Use only the isolated vault settings window.");
  page.setDefaultTimeout(10_000);
  await page.evaluate(() => {
    const plugin = () => opener.app.plugins.plugins["mcp-pro"];
    window.fixture = {
      settings: () => plugin().settings,
      failNext: () => {
        const target = plugin();
        const update = target.updateSettings;
        target.updateSettings = async function () {
          target.updateSettings = update;
          throw new Error("Synthetic failure containing a secret");
        };
      },
      addAssignedToken: () =>
        plugin().updateSettings((current) => ({
          ...current,
          tokens: [
            ...current.tokens,
            {
              id: crypto.randomUUID(),
              label: "Agent three",
              token: require("node:crypto").randomBytes(32).toString("hex"),
              roleId: "read-only",
            },
          ],
        })),
      get copied() {
        return opener.__uiCopied;
      },
    };
    const writeText = async (text) => {
      opener.__uiCopied = text;
    };
    writeText.__roleUiIntercept = true;
    navigator.clipboard.writeText = writeText;
    if (navigator.clipboard.writeText !== writeText)
      throw new Error("Settings clipboard interception failed.");
  });
  const snapshot = async () => {
    assert.equal(
      await page.evaluate(
        () =>
          navigator.clipboard.writeText.__roleUiIntercept === true &&
          opener.navigator.clipboard.writeText.__roleUiIntercept === true,
      ),
      true,
      "Both clipboard realms must stay intercepted.",
    );
    const secrets = await page.evaluate(() =>
      window.fixture.settings().tokens.map((token) => token.token),
    );
    let tree = await page.locator("body").ariaSnapshot();
    for (const secret of secrets) tree = tree.split(secret).join("[MASKED]");
    assert.ok(!secrets.some((secret) => tree.includes(secret)));
    snapshots += 1;
  };
  const wrap = (object) =>
    new Proxy(object, {
      get(target, name) {
        const value = Reflect.get(target, name);
        if (typeof value !== "function")
          return value && typeof value === "object" && name === "keyboard"
            ? wrap(value)
            : value;
        return (...args) => {
          if (observed.has(name))
            return (async () => {
              await snapshot();
              console.log(`UI action ${snapshots}: ${String(name)}`);
              const result = await value.apply(target, args);
              await snapshot();
              return result;
            })();
          const result = value.apply(target, args);
          return result && typeof result.locator === "function"
            ? wrap(result)
            : result;
        };
      },
    });
  await snapshot();
  if (!process.argv.includes("--live-only")) {
    await runUiChecks(wrap(page));
    await runHostChecks(wrap(page), main);
  }
  await runLiveSessionChecks(wrap(page), main);
  console.log(
    JSON.stringify({
      result: "PASS",
      runtime: {
        node: identity.version.node,
        electron: identity.version.electron,
      },
      redactedSnapshots: snapshots,
      limitations:
        "Official Obsidian renderer with isolated bootstrap; no macOS VoiceOver or OS clipboard test.",
    }),
  );
} finally {
  if (initial && main)
    await main.evaluate(async (settings) => {
      const plugin = app.plugins.plugins["mcp-pro"];
      await plugin.manager?.stop();
      await plugin.updateSettings(() => settings);
      app.setting.openTabById("mcp-pro");
    }, initial);
  await browser.close();
}

async function runHostChecks(page, main) {
  const input = page.getByLabel("Additional allowed hosts", { exact: true });
  const before = await main.evaluate(
    () => app.plugins.plugins["mcp-pro"].settings.allowedHosts,
  );
  await input.fill("vault.example.com\nhttps://bad.example\n\n*.bad.example");
  await page
    .getByRole("button", { name: "Save Allowed Hosts", exact: true })
    .click();
  assert.match(await page.locator(".mcp-settings").textContent(), /lines 2, 4/);
  assert.deepEqual(
    await main.evaluate(
      () => app.plugins.plugins["mcp-pro"].settings.allowedHosts,
    ),
    before,
  );
  await input.fill("VAULT.EXAMPLE.COM\n[::1]\nvault.example.com");
  await page
    .getByRole("button", { name: "Save Allowed Hosts", exact: true })
    .click();
  await main.waitForFunction(
    () => app.plugins.plugins["mcp-pro"].settings.allowedHosts.length === 2,
  );
  assert.deepEqual(
    await main.evaluate(
      () => app.plugins.plugins["mcp-pro"].settings.allowedHosts,
    ),
    ["vault.example.com", "[::1]"],
  );
  const saved = await input.inputValue();
  await page
    .getByRole("button", { name: "Detect Machine Hosts", exact: true })
    .click();
  assert.ok((await input.inputValue()).startsWith(saved));
  assert.deepEqual(
    await main.evaluate(
      () => app.plugins.plugins["mcp-pro"].settings.allowedHosts,
    ),
    ["vault.example.com", "[::1]"],
  );
}

async function runLiveSessionChecks(page, main) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  await page
    .getByRole("textbox", { name: "Port", exact: true })
    .fill(String(port));
  await page
    .getByRole("button", { name: "Save Connection", exact: true })
    .click();
  await main.waitForFunction(
    (port) => app.plugins.plugins["mcp-pro"].settings.port === port,
    port,
  );
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await main.waitForFunction(
    () =>
      app.plugins.plugins["mcp-pro"].manager.getState().status === "running",
  );
  const bearer = await main.evaluate(
    () => app.plugins.plugins["mcp-pro"].settings.tokens[0].token,
  );
  const rpc = async (method, session, params = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(session
          ? { "Mcp-Session-Id": session, "MCP-Protocol-Version": "2025-03-26" }
          : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    const data =
      text.startsWith("event:") || text.startsWith("data:")
        ? text
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim()
        : text;
    return {
      status: response.status,
      session: response.headers.get("Mcp-Session-Id"),
      body: data ? JSON.parse(data) : null,
    };
  };
  const initialize = () =>
    rpc("initialize", null, {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "role-ui-acceptance", version: "1" },
    });
  const first = await initialize();
  assert.equal(first.status, 200);
  assert.ok(
    (await rpc("tools/list", first.session)).body.result.tools.some(
      (tool) => tool.name === "get_note",
    ),
  );
  const firstSdk = await sdkClient(port, bearer);
  assert.ok(
    (await firstSdk.listTools()).tools.some((tool) => tool.name === "get_note"),
  );
  const firstRow = page.locator(".mcp-token").first();
  await firstRow
    .getByLabel("Role", { exact: true })
    .selectOption("append-only");
  await firstRow
    .getByRole("button", { name: "Save Token", exact: true })
    .click();
  await main.waitForFunction(
    () =>
      app.plugins.plugins["mcp-pro"].settings.tokens[0].roleId ===
      "append-only",
  );
  assert.notEqual((await rpc("tools/list", first.session)).status, 200);
  await assert.rejects(() => firstSdk.listTools());
  await firstSdk.close();
  const second = await initialize();
  assert.equal(second.status, 200);
  assert.deepEqual(
    (await rpc("tools/list", second.session)).body.result.tools.map(
      (tool) => tool.name,
    ),
    ["append_to_note"],
  );
  const secondSdk = await sdkClient(port, bearer);
  assert.deepEqual(
    (await secondSdk.listTools()).tools.map((tool) => tool.name),
    ["append_to_note"],
  );
  const denied = await rpc("tools/call", second.session, {
    name: "get_note",
    arguments: { path: "synthetic-only.md" },
  });
  assert.ok(denied.body.error || denied.body.result?.isError);
  const editor = page.locator(".mcp-settings > section").first();
  await editor.getByLabel("Role", { exact: true }).selectOption("append-only");
  await editor
    .getByLabel("Select all Create and modify notes tools", { exact: true })
    .check();
  await editor
    .getByLabel("Select all Create and modify notes tools", { exact: true })
    .uncheck();
  await editor
    .getByRole("button", { name: "Review and Save Role", exact: true })
    .click();
  assert.match(await editor.textContent(), /Affected tokens: Agent one/);
  await editor.getByRole("button", { name: "Save Role", exact: true }).click();
  await main.waitForFunction(
    () =>
      app.plugins.plugins["mcp-pro"].settings.roles.find(
        (role) => role.id === "append-only",
      ).tools.length === 0,
  );
  assert.notEqual((await rpc("tools/list", second.session)).status, 200);
  await assert.rejects(() => secondSdk.listTools());
  await secondSdk.close();
  const third = await initialize();
  assert.equal(third.status, 200);
  assert.deepEqual(
    (await rpc("tools/list", third.session)).body.result.tools,
    [],
  );
  const thirdSdk = await sdkClient(port, bearer);
  assert.deepEqual((await thirdSdk.listTools()).tools, []);
  await thirdSdk.close();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
}

async function sdkClient(port, bearer) {
  const resolve = createRequire(
    createRequire(import.meta.url).resolve("obsidian-mcp-pro"),
  );
  const { Client } = await import(
    pathToFileURL(resolve.resolve("@modelcontextprotocol/sdk/client/index.js"))
      .href
  );
  const { StreamableHTTPClientTransport } = await import(
    pathToFileURL(
      resolve.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    ).href
  );
  const client = new Client({ name: "native-role-ui-sdk", version: "1" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    },
  );
  await client.connect(transport);
  return client;
}
