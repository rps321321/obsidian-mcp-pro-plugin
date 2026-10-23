import { FileSystemAdapter, Plugin } from "obsidian";
import { McpSettingsTab } from "./settings";
import {
  DEFAULT_SETTINGS,
  loadSettingsData,
  type Settings,
} from "./settings-model";
import { ServerManager } from "./server-manager";

export default class McpProPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
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
        void this.manager.stop().catch(() => undefined);
      } else {
        void this.manager.start().catch(() => undefined);
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
      callback: () => {
        void this.manager.start().catch(() => undefined);
      },
    });
    this.addCommand({
      id: "stop-server",
      name: "Stop server",
      callback: () => {
        void this.manager.stop().catch(() => undefined);
      },
    });

    if (this.settings.autoStart) {
      // Defer listener startup until Obsidian has opened the vault workspace.
      this.app.workspace.onLayoutReady(() => {
        void this.manager.start().catch(() => undefined);
      });
    }
  }

  onunload(): void {
    this.unsubscribeStatusBar?.();
    this.unsubscribeStatusBar = null;
    void this.manager?.stop().catch(() => undefined);
  }

  private resolveVaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
    throw new Error(
      "Unable to determine vault filesystem path (desktop-only plugin).",
    );
  }

  async loadSettings(): Promise<void> {
    try {
      const loaded = loadSettingsData(await this.loadData());
      if (loaded.migrated) await this.saveData(loaded.settings);
      this.settings = loaded.settings;
    } catch {
      throw new Error(
        "MCP settings could not be loaded or migrated. Server startup was cancelled.",
      );
    }
  }

  updateSettings(change: (current: Settings) => Settings): Promise<void> {
    return this.manager.updateSettings(change, async (next) => {
      await this.saveData(next);
      this.settings = next;
    });
  }
}
