import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, request } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { artifact, runtimeFixture } from "../tests/runtime-harness.mjs";

const secret = randomBytes(32).toString("hex");
const script = new URL("check-connection.mjs", import.meta.url);

async function run(url, token = secret) {
  const child = spawn(process.execPath, [fileURLToPath(script)], {
    env: { ...process.env, MCP_SERVER_URL: url, MCP_BEARER_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 25000,
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.ok(!output.includes(secret), "must not print the bearer secret");
  assert.ok(
    !output.includes("runtime fixture note"),
    "must not print vault text",
  );
  assert.ok(!output.includes(" at "), "must not print an error stack");
  return { code, output };
}

test("connection check reports missing input and stopped endpoints safely", async () => {
  assert.match((await run("", "")).output, /Set MCP_SERVER_URL/);
  assert.match((await run("not a URL")).output, /Set MCP_SERVER_URL/);
  assert.match(
    (await run(`http://user:${secret}@127.0.0.1/mcp`)).output,
    /URL credentials and fragments are not accepted/,
  );
  assert.match(
    (await run("http://127.0.0.1/mcp", `${secret}\n`)).output,
    /Set MCP_SERVER_URL/,
  );
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const result = await run(`http://127.0.0.1:${port}/mcp`);
  assert.equal(result.code, 1);
  assert.match(result.output, /Check that Obsidian and the server are running/);
});

test("connection check gives a fixed Host denial diagnostic", async () => {
  const listener = createServer((_request, response) => {
    response.writeHead(403).end(`secret upstream detail ${secret}`);
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  try {
    const result = await run(`http://127.0.0.1:${listener.address().port}/mcp`);
    assert.equal(result.code, 1);
    assert.match(result.output, /HTTP 403.*Host and port/);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

test("connection check bounds a stalled initialization request", async () => {
  const listener = createServer(() => {});
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const started = performance.now();
  try {
    const result = await run(`http://127.0.0.1:${listener.address().port}/mcp`);
    assert.equal(result.code, 1);
    assert.match(result.output, /Connection check failed/);
    assert.ok(performance.now() - started < 10000);
  } finally {
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
  }
});

test("connection check uses the production bundle with real auth, discovery, and stats", async () => {
  const fixture = await runtimeFixture({
    saved: {
      schemaVersion: 2,
      host: "127.0.0.1",
      port: 0,
      vaultName: "",
      autoStart: false,
      allowedHosts: [],
      roles: [{ id: "reader", name: "Reader", tools: ["get_vault_stats"] }],
      tokens: [
        { id: "test", label: "Checker", token: secret, roleId: "reader" },
      ],
    },
  });
  let proxy;
  try {
    await fixture.manager.start();
    const url = fixture.manager.getState().url;
    const good = await run(url);
    assert.equal(good.code, 0);
    assert.equal(
      good.output.trim(),
      "Connected, listed permitted Tools, and read vault statistics.",
    );
    const bad = await run(url, `${secret}wrong`);
    assert.equal(bad.code, 1);
    assert.match(bad.output, /HTTP 401/);
    const missing = await run(url, "");
    assert.equal(missing.code, 1);
    assert.match(missing.output, /Set MCP_SERVER_URL/);
    proxy = createServer((incoming, outgoing) => {
      const upstream = request(
        url,
        {
          method: incoming.method,
          headers: { ...incoming.headers, host: "blocked.invalid" },
        },
        (response) => {
          outgoing.writeHead(response.statusCode, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on("error", () => outgoing.destroy());
      incoming.pipe(upstream);
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const hostDenied = await run(
      `http://127.0.0.1:${proxy.address().port}/mcp`,
    );
    assert.equal(hostDenied.code, 1);
    assert.match(hostDenied.output, /HTTP 403.*Host and port/);
    await fixture.manager.updateSettings(
      (current) => ({
        ...current,
        roles: [{ ...current.roles[0], tools: [] }],
      }),
      async (next) => {
        fixture.plugin.settings = next;
      },
    );
    const denied = await run(url);
    assert.equal(denied.code, 1);
    assert.match(denied.output, /get_vault_stats is not advertised/);
    console.log(JSON.stringify({ productionArtifact: artifact }));
  } finally {
    try {
      if (proxy) await new Promise((resolve) => proxy.close(resolve));
    } finally {
      await fixture.cleanup();
    }
  }
});
