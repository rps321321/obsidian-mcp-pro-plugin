import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalizeHostEntry,
  isValidHostEntry,
  normalizeHostEntries,
  expandHosts,
} from "../src/hosts.ts";

const valid = new Map([
  [" Vault.Example.com ", "vault.example.com"],
  ["bücher.example", "xn--bcher-kva.example"],
  ["BÜCHER.example:00443", "xn--bcher-kva.example:443"],
  ["127.0.0.1:3333", "127.0.0.1:3333"],
  ["2001:0DB8:0:0::1", "[2001:db8::1]"],
  ["[2001:0DB8::1]:0443", "[2001:db8::1]:443"],
  ["localhost", "localhost"],
  ["vault.example.", "vault.example."],
]);
for (const [input, expected] of valid)
  test(`should canonicalize ${input}`, () => {
    assert.equal(canonicalizeHostEntry(input), expected);
    assert.equal(isValidHostEntry(input), true);
  });
const invalid = [
  "",
  "*",
  "https://vault.example",
  "vault.example/path",
  "user@vault.example",
  "vault.example?x",
  "vault.example#x",
  "vault.example\\path",
  "vault example",
  "vault\n.example",
  "vault.example:",
  "vault.example:0",
  "vault.example:65536",
  "vault.example:-1",
  "vault.example:443x",
  "[::1",
  "[::1]extra",
  "[127.0.0.1]",
  "fe80::1%eth0",
  "vault..example",
  "-vault.example",
  "vault-.example",
  "127.1",
  "0x7f000001",
  "01.2.3.4",
  "a".repeat(64) + ".example",
];
for (const input of invalid)
  test(`should reject invalid entry ${JSON.stringify(input)}`, () => {
    assert.equal(isValidHostEntry(input), false);
    assert.throws(() => canonicalizeHostEntry(input));
  });
test("should reject an entire update when any host entry is invalid", () => {
  assert.throws(() => normalizeHostEntries(["valid.example", "*"]));
  assert.throws(() => expandHosts(["valid.example", "*"], 3333));
});
test("should normalize duplicates without mutating saved entries", () => {
  const entries = Object.freeze([
    " Vault.Example ",
    "vault.example",
    "bücher.example",
  ]);
  assert.deepEqual(normalizeHostEntries(entries), [
    "vault.example",
    "xn--bcher-kva.example",
  ]);
  assert.equal(entries[0], " Vault.Example ");
});
test("should derive the active port only for bare entries", () => {
  const entries = Object.freeze([
    "Vault.Example",
    "proxy.example:443",
    "2001:db8::1",
  ]);
  assert.deepEqual(expandHosts(entries, 3333), [
    "vault.example",
    "vault.example:3333",
    "proxy.example:443",
    "[2001:db8::1]",
    "[2001:db8::1]:3333",
  ]);
  assert.deepEqual(expandHosts(["vault.example"], 4444), [
    "vault.example",
    "vault.example:4444",
  ]);
});
test("should leave core bind and loopback defaults to the core", () => {
  assert.deepEqual(expandHosts([], 3333), []);
});
test("should not invent a listening port before an ephemeral bind", () => {
  assert.deepEqual(expandHosts(["vault.example", "proxy.example:443"], 0), [
    "vault.example",
    "proxy.example:443",
  ]);
});
for (const port of [-1, 65536, NaN, 3333.5])
  test(`should reject invalid listening port ${port}`, () =>
    assert.throws(() => expandHosts([], port)));

test("should enumerate machine candidates only after the explicit detection call", async () => {
  const { default: os } = await import("node:os");
  const { syncBuiltinESMExports } = await import("node:module");
  const oldHostname = os.hostname,
    oldInterfaces = os.networkInterfaces;
  let hostnameCalls = 0,
    interfaceCalls = 0;
  os.hostname = () => {
    hostnameCalls++;
    return "Desk.Example";
  };
  os.networkInterfaces = () => {
    interfaceCalls++;
    return {
      lan: [
        { family: "IPv4", address: "192.0.2.10", internal: false },
        { family: "IPv4", address: "127.0.0.1", internal: true },
        { family: "IPv6", address: "2001:db8::1", internal: false, scopeid: 0 },
        { family: "IPv6", address: "fe80::1", internal: false, scopeid: 7 },
      ],
    };
  };
  syncBuiltinESMExports();
  try {
    const { detectMachineHosts } =
      await import("../src/hosts.ts?explicit-detection");
    assert.equal(hostnameCalls, 0);
    assert.equal(interfaceCalls, 0);
    assert.deepEqual(detectMachineHosts(), [
      "desk.example",
      "desk",
      "192.0.2.10",
      "[2001:db8::1]",
    ]);
    assert.equal(hostnameCalls, 1);
    assert.equal(interfaceCalls, 1);
  } finally {
    os.hostname = oldHostname;
    os.networkInterfaces = oldInterfaces;
    syncBuiltinESMExports();
  }
});
