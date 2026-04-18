import {
  App,
  PluginSettingTab,
  Setting,
  type ButtonComponent,
  type Plugin,
} from "obsidian";
import type { ServerManager } from "./server-manager";

export interface Settings {
  host: string;
  port: number;
  bearerToken: string;
  vaultName: string;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  host: "127.0.0.1",
  port: 3333,
  bearerToken: "",
  vaultName: "",
  autoStart: false,
};

interface HostPlugin extends Plugin {
  settings: Settings;
  saveSettings: () => Promise<void>;
}

export class McpSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: HostPlugin,
    private manager: ServerManager,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl, plugin, manager } = this;
    containerEl.empty();

    const status = containerEl.createDiv({ cls: "mcp-status" });
    const renderStatus = (): void => {
      const s = manager.getState();
      status.empty();
      const label = status.createSpan();
      label.setText(`Status: ${s.status}`);
      if (s.status === "running" && s.port) {
        const url = `http://${plugin.settings.host}:${s.port}/mcp`;
        status.createEl("code", { text: url, cls: "mcp-status-url" });
      }
      if (s.lastError) {
        status.createEl("div", { text: s.lastError, cls: "mod-warning mcp-status-error" });
      }
    };
    manager.subscribe(renderStatus);

    new Setting(containerEl)
      .setName("Server control")
      .setDesc("Start or stop the server.")
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText("Start").onClick(() => manager.start()),
      )
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText("Stop").onClick(() => manager.stop()),
      );

    new Setting(containerEl)
      .setName("Auto-start on launch")
      .addToggle((t) =>
        t.setValue(plugin.settings.autoStart).onChange(async (v) => {
          plugin.settings.autoStart = v;
          await plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Host")
      .setDesc("Bind address. Keep 127.0.0.1 unless you know what you're doing.")
      .addText((t) =>
        t
          .setPlaceholder("127.0.0.1")
          .setValue(plugin.settings.host)
          .onChange(async (v) => {
            plugin.settings.host = v.trim() || "127.0.0.1";
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("HTTP port to listen on.")
      .addText((t) =>
        t
          .setPlaceholder("3333")
          .setValue(String(plugin.settings.port))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isInteger(n) && n > 0 && n < 65536) {
              plugin.settings.port = n;
              await plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc(
        "Optional. If set, clients must send Authorization: Bearer <token>.",
      )
      .addText((t) =>
        t
          .setPlaceholder("(empty)")
          .setValue(plugin.settings.bearerToken)
          .onChange(async (v) => {
            plugin.settings.bearerToken = v;
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Connection snippet")
      .setDesc("Paste this into a client's config.")
      .addButton((btn) =>
        btn.setButtonText("Copy JSON").onClick(async () => {
          const snippet = {
            mcpServers: {
              obsidian: {
                url: `http://${plugin.settings.host}:${plugin.settings.port}/mcp`,
                ...(plugin.settings.bearerToken
                  ? { headers: { Authorization: `Bearer ${plugin.settings.bearerToken}` } }
                  : {}),
              },
            },
          };
          await navigator.clipboard.writeText(JSON.stringify(snippet, null, 2));
        }),
      );
  }
}
