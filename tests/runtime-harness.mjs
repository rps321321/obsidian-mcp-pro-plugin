import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import { runInThisContext } from "node:vm";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

class Element {
  constructor(tag, ownerDocument) {
    this.tag = tag;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.events = new Map();
    this.classList = { add() {} };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  empty() {
    this.replaceChildren();
  }
  addClass() {}
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(name, callback) {
    this.events.set(name, callback);
  }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tag === tag ? [child] : []),
      ...child.querySelectorAll(tag),
    ]);
  }
  querySelector(tag) {
    return this.querySelectorAll(tag)[0] ?? null;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  click() {
    return this.events.get("click")?.();
  }
}

function hostBoundary() {
  let copied;
  const document = {
    createElement(tag) {
      return new Element(tag, document);
    },
    defaultView: {
      navigator: {
        clipboard: {
          async writeText(value) {
            copied = value;
          },
        },
      },
    },
  };
  class Plugin {}
  class FileSystemAdapter {
    constructor(vault) {
      this.vault = vault;
    }
    getBasePath() {
      return this.vault;
    }
  }
  class PluginSettingTab {
    constructor() {
      this.containerEl = document.createElement("div");
    }
  }
  class Setting {
    constructor(parent) {
      this.parent = parent;
    }
    setName() {
      return this;
    }
    setDesc() {
      return this;
    }
    addText(callback) {
      const control = {
        inputEl: document.createElement("input"),
        setPlaceholder() {
          return control;
        },
        setValue() {
          return control;
        },
        onChange() {
          return control;
        },
      };
      callback(control);
      return this;
    }
    addButton(callback) {
      const node = document.createElement("button");
      this.parent.appendChild(node);
      const control = {
        setButtonText(value) {
          node.textContent = value;
          return control;
        },
        onClick(action) {
          node.addEventListener("click", action);
          return control;
        },
      };
      callback(control);
      return this;
    }
    addToggle(callback) {
      const control = {
        toggleEl: document.createElement("input"),
        setValue() {
          return control;
        },
        onChange() {
          return control;
        },
      };
      callback(control);
      return this;
    }
  }
  return {
    api: {
      Plugin,
      FileSystemAdapter,
      PluginSettingTab,
      Setting,
      Notice: class {},
    },
    copied: () => copied,
  };
}

const bundlePath = process.env.PLUGIN_BUNDLE_PATH
  ? resolve(process.env.PLUGIN_BUNDLE_PATH)
  : fileURLToPath(new URL("../main.js", import.meta.url));
const bundle = await readFile(bundlePath, "utf8");
const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
export const artifact = {
  sha256: createHash("sha256").update(bundle).digest("hex"),
  coreVersion: lock.packages["node_modules/obsidian-mcp-pro"].version,
  sdkVersion: lock.packages["node_modules/@modelcontextprotocol/sdk"].version,
};

export const pdf = await readFile(
  new URL("./fixtures/runtime.pdf", import.meta.url),
);
export const docx = await readFile(
  new URL("./fixtures/runtime.docx", import.meta.url),
);

export async function runtimeFixture({ port = 0, saved } = {}) {
  const boundary = hostBoundary();
  const module = { exports: {} };
  const require = createRequire(bundlePath);
  const load = runInThisContext(Module.wrap(bundle), { filename: bundlePath });
  load(
    module.exports,
    (name) => (name === "obsidian" ? boundary.api : require(name)),
    module,
    bundlePath,
    dirname(bundlePath),
  );
  const plugin = new module.exports.default();
  const temporaryRoot = resolve(tmpdir());
  const vault = resolve(
    await mkdtemp(join(temporaryRoot, "plugin-artifact-runtime-")),
  );
  if (
    dirname(vault) !== temporaryRoot ||
    !basename(vault).startsWith("plugin-artifact-runtime-")
  )
    throw new Error("Refusing an unowned runtime vault path");
  const clients = [];
  let tab;
  const settings = saved ?? {
    schemaVersion: 2,
    host: "127.0.0.1",
    port,
    vaultName: "",
    autoStart: false,
    allowedHosts: [],
    roles: [
      { id: "reader", name: "Reader", tools: ["get_note", "get_attachment"] },
    ],
    tokens: [
      {
        id: "one",
        label: "One",
        token: "synthetic-runtime-one",
        roleId: "reader",
      },
      {
        id: "two",
        label: "Two",
        token: "synthetic-runtime-two",
        roleId: "reader",
      },
    ],
  };
  Object.assign(plugin, {
    app: { vault: { adapter: new boundary.api.FileSystemAdapter(vault) } },
    loadData: async () => settings,
    saveData: async () => undefined,
    addSettingTab: (value) => {
      tab = value;
    },
    addRibbonIcon: () => undefined,
    addStatusBarItem: () => ({ setText() {} }),
    addCommand: () => undefined,
  });
  try {
    await mkdir(join(vault, ".obsidian"));
    await writeFile(join(vault, "note.md"), "runtime fixture note");
    await writeFile(join(vault, "sample.pdf"), pdf);
    await writeFile(join(vault, "sample.docx"), docx);
    await plugin.onload();
  } catch (err) {
    await rm(vault, { recursive: true, force: true });
    throw err;
  }
  return {
    plugin,
    manager: plugin.manager,
    vault,
    async connect(token = "synthetic-runtime-one", config) {
      const client = new Client({
        name: "production-artifact-test",
        version: "1",
      });
      const transport = new StreamableHTTPClientTransport(
        new URL(config?.url ?? plugin.manager.getState().url),
        {
          requestInit: {
            headers: config?.headers ?? { Authorization: `Bearer ${token}` },
          },
        },
      );
      clients.push(client);
      await client.connect(transport);
      return { client, transport };
    },
    async connectionConfig() {
      tab.display();
      const find = (label) =>
        tab.containerEl
          .querySelectorAll("button")
          .find((button) => button.textContent === label);
      find("Copy Connection JSON…").click();
      find("Continue").click();
      await new Promise((resolve) => setImmediate(resolve));
      return JSON.parse(boundary.copied());
    },
    async cleanup() {
      try {
        await Promise.all(
          clients.map((client) => client.close().catch(() => undefined)),
        );
        tab?.hide();
        plugin.onunload();
        await plugin.manager.stop();
      } finally {
        await rm(vault, { recursive: true, force: true });
      }
    },
  };
}
