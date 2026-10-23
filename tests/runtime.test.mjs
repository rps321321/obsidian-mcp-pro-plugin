import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { artifact, runtimeFixture, pdf, docx } from "./runtime-harness.mjs";

console.log(JSON.stringify({ productionArtifact: artifact }));

test("should initialize two independent SDK sessions, read notes and reconnect using the production artifact", async () => {
  const fixture = await runtimeFixture();
  try {
    await fixture.manager.start();
    const [one, two] = await Promise.all([
      fixture.connect(),
      fixture.connect("synthetic-runtime-two"),
    ]);
    assert.ok(one.transport.sessionId);
    assert.ok(two.transport.sessionId);
    assert.notEqual(one.transport.sessionId, two.transport.sessionId);
    for (const { client } of [one, two]) {
      assert.deepEqual(
        (await client.listTools()).tools.map((tool) => tool.name).sort(),
        ["get_attachment", "get_note"],
      );
      const result = await client.callTool({
        name: "get_note",
        arguments: { path: "note.md" },
      });
      assert.notEqual(result.isError, true);
      assert.match(JSON.stringify(result.content), /runtime fixture note/);
    }
    await one.transport.terminateSession();
    await one.client.close();
    assert.equal((await two.client.listTools()).tools.length, 2);
    const reconnected = await fixture.connect();
    assert.notEqual(reconnected.transport.sessionId, two.transport.sessionId);
    assert.equal((await reconnected.client.listTools()).tools.length, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("should reject missing and incorrect credentials and connect with actual copied connection JSON", async () => {
  const fixture = await runtimeFixture();
  try {
    await fixture.manager.start();
    for (const headers of [
      {},
      { Authorization: "Bearer wrong-runtime-token" },
    ]) {
      const response = await fetch(fixture.manager.getState().url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: "{}",
      });
      assert.equal(response.status, 401);
    }
    const config = await fixture.connectionConfig();
    const connected = await fixture.connect(
      undefined,
      config.mcpServers.obsidian,
    );
    assert.deepEqual(config, {
      mcpServers: {
        obsidian: {
          url: fixture.manager.getState().url,
          headers: { Authorization: "Bearer synthetic-runtime-one" },
        },
      },
    });
    assert.equal((await connected.client.listTools()).tools.length, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("should refuse empty bearer credentials before listening and never disable authentication with zero tokens", async () => {
  const fixture = await runtimeFixture();
  try {
    fixture.plugin.settings = {
      ...fixture.plugin.settings,
      tokens: [{ ...fixture.plugin.settings.tokens[0], token: "" }],
    };
    await assert.rejects(fixture.manager.start(), /could not be started/);
    assert.equal(fixture.manager.getState().status, "error");
    assert.equal(fixture.manager.getState().url, undefined);
    fixture.plugin.settings = { ...fixture.plugin.settings, tokens: [] };
    await fixture.manager.start();
    assert.equal(
      (
        await fetch(fixture.manager.getState().url, {
          method: "POST",
          body: "{}",
        })
      ).status,
      401,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("should report bind collisions, release the port, reject old sessions and restart", async () => {
  const holder = createServer();
  let fixture;
  try {
    await new Promise((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(0, "127.0.0.1", resolve);
    });
    const port = holder.address().port;
    fixture = await runtimeFixture({ port });
    await assert.rejects(fixture.manager.start(), /could not be started/);
    assert.equal(fixture.manager.getState().status, "error");
    await new Promise((resolve, reject) =>
      holder.close((err) => (err ? reject(err) : resolve())),
    );
    await fixture.manager.start();
    const one = await fixture.connect();
    const url = fixture.manager.getState().url;
    const sid = one.transport.sessionId;
    await fixture.manager.stop();
    await assert.rejects(fetch(new URL("/health", url)));
    await fixture.manager.start();
    assert.equal(fixture.manager.getState().url, url);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-runtime-one",
        "Mcp-Session-Id": sid,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    assert.equal(response.status, 400);
    const restarted = await fixture.connect();
    assert.notEqual(restarted.transport.sessionId, sid);
    assert.equal((await restarted.client.listTools()).tools.length, 2);
  } finally {
    if (holder.listening) await new Promise((resolve) => holder.close(resolve));
    await fixture?.cleanup();
  }
});

test("should return PDF and DOCX resource blocks with byte-identical payloads", async () => {
  const fixture = await runtimeFixture();
  try {
    await fixture.manager.start();
    const { client } = await fixture.connect();
    for (const [name, bytes, mimeType] of [
      ["sample.pdf", pdf, "application/pdf"],
      ["sample.docx", docx, "application/octet-stream"],
    ]) {
      const result = await client.callTool({
        name: "get_attachment",
        arguments: { path: name },
      });
      assert.notEqual(result.isError, true);
      assert.deepEqual(
        result.content.map((block) => block.type),
        ["text", "resource"],
      );
      const resource = result.content[1].resource;
      assert.equal(resource.uri, `vault://${name}`);
      assert.equal(resource.mimeType, mimeType);
      assert.deepEqual(Buffer.from(resource.blob, "base64"), bytes);
    }
  } finally {
    await fixture.cleanup();
  }
});
