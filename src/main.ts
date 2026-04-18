import { Plugin } from "obsidian";
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
    this.manager = new ServerManager(vaultPath, () => this.settings);

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

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
