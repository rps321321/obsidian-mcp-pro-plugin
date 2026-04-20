import { FileSystemAdapter, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  McpSettingsTab,
  type Settings,
} from "./settings";
import { ServerManager } from "./server-manager";

export default class McpProPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private manager!: ServerManager;
  private statusBarEl: HTMLElement | null = null;
  private unsubscribeStatusBar: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    const vaultPath = this.resolveVaultPath();
    this.manager = new ServerManager(vaultPath, () => this.settings);

    this.addSettingTab(new McpSettingsTab(this.app, this, this.manager));

    this.addRibbonIcon("server", "Toggle server", () => {
      if (this.manager.isRunning()) {
        void this.manager.stop();
      } else {
        void this.manager.start();
      }
    });

    this.statusBarEl = this.addStatusBarItem();
    this.unsubscribeStatusBar = this.manager.subscribe((s) => {
      if (!this.statusBarEl) return;
      if (s.status === "running" && s.port) {
        this.statusBarEl.setText(`Server :${s.port}`);
      } else if (s.status === "starting") {
        this.statusBarEl.setText("Server starting…");
      } else if (s.status === "error") {
        this.statusBarEl.setText("Server error");
      } else {
        this.statusBarEl.setText("Server off");
      }
    });

    this.addCommand({
      id: "start-server",
      name: "Start server",
      callback: () => { void this.manager.start(); },
    });
    this.addCommand({
      id: "stop-server",
      name: "Stop server",
      callback: () => { void this.manager.stop(); },
    });

    if (this.settings.autoStart) {
      // Defer until workspace ready; spawning a child during onload can
      // delay startup noticeably on slower machines.
      this.app.workspace.onLayoutReady(() => { void this.manager.start(); });
    }
  }

  async onunload(): Promise<void> {
    this.unsubscribeStatusBar?.();
    this.unsubscribeStatusBar = null;
    await this.manager?.stop();
  }

  private resolveVaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
    throw new Error("Unable to determine vault filesystem path (desktop-only plugin).");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
