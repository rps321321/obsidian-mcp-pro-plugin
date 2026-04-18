import { Plugin, Notice } from "obsidian";
import * as path from "path";
import { createRequire } from "module";
import {
  DEFAULT_SETTINGS,
  McpSettingsTab,
  type Settings,
} from "./settings";
import { ServerManager } from "./server-manager";

export default class McpProPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  private manager!: ServerManager;
  private statusBarEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    const vaultPath = this.resolveVaultPath();
    this.manager = new ServerManager(
      vaultPath,
      () => this.settings,
      () => this.resolveEntryPath(),
    );

    this.addSettingTab(new McpSettingsTab(this.app, this, this.manager));

    this.addRibbonIcon("server", "Toggle MCP Pro server", async () => {
      if (this.manager.isRunning()) {
        await this.manager.stop();
      } else {
        await this.manager.start();
      }
    });

    this.statusBarEl = this.addStatusBarItem();
    this.manager.subscribe((s) => {
      if (!this.statusBarEl) return;
      if (s.status === "running" && s.port) {
        this.statusBarEl.setText(`MCP :${s.port}`);
      } else if (s.status === "starting") {
        this.statusBarEl.setText("MCP …");
      } else if (s.status === "error") {
        this.statusBarEl.setText("MCP !");
      } else {
        this.statusBarEl.setText("MCP off");
      }
    });

    this.addCommand({
      id: "start-server",
      name: "Start MCP server",
      callback: () => this.manager.start(),
    });
    this.addCommand({
      id: "stop-server",
      name: "Stop MCP server",
      callback: () => this.manager.stop(),
    });

    if (this.settings.autoStart) {
      // Defer until workspace ready; spawning a child during onload can
      // delay startup noticeably on slower machines.
      this.app.workspace.onLayoutReady(() => this.manager.start());
    }
  }

  async onunload(): Promise<void> {
    await this.manager?.stop();
  }

  private resolveVaultPath(): string {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string; getBasePath?: () => string };
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    if (typeof adapter.basePath === "string") return adapter.basePath;
    throw new Error("Unable to determine vault filesystem path (desktop-only plugin).");
  }

  private resolveEntryPath(): string {
    // Plugin is a CommonJS bundle, but esbuild's external import of
    // `obsidian-mcp-pro` means we can't `require` it directly from a bundled
    // module reliably. Resolve via createRequire from the plugin's own dir.
    try {
      const req = createRequire(path.join(this.getPluginDir(), "main.js"));
      return req.resolve("obsidian-mcp-pro/build/index.js");
    } catch (err) {
      new Notice(
        "MCP Pro: cannot find obsidian-mcp-pro. Run `npm install` in the plugin directory.",
        8_000,
      );
      throw err;
    }
  }

  private getPluginDir(): string {
    const vaultPath = this.resolveVaultPath();
    return path.join(vaultPath, this.app.vault.configDir, "plugins", this.manifest.id);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
