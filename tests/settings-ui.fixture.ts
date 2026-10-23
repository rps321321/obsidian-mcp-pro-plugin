import { RoleEditor } from "../src/role-editor";
import { TokenSettings } from "../src/token-settings";
import {
  createPresetRoles,
  createToken,
  validateSettings,
  DEFAULT_SETTINGS,
  type Settings,
} from "../src/settings-model";

const roles = createPresetRoles();
const initial = validateSettings({
  ...DEFAULT_SETTINGS,
  roles,
  tokens: [
    createToken("Agent one", "read-only"),
    createToken("Agent two", "read-only"),
  ],
});
let current = initial;
let failNext = false;
const plugin = {
  get settings(): Settings {
    return current;
  },
  async updateSettings(
    change: (settings: Settings) => Settings,
  ): Promise<void> {
    if (failNext) {
      failNext = false;
      throw new Error("Synthetic failure containing a secret");
    }
    current = validateSettings(change(current));
  },
};
const root = document.querySelector<HTMLElement>("main")!;
const rolesRoot = document.createElement("section");
root.appendChild(rolesRoot);
let tokens: TokenSettings;
const editor = new RoleEditor(rolesRoot, plugin as never, () =>
  tokens.refreshRoles(),
);
const tokensRoot = document.createElement("section");
root.appendChild(tokensRoot);
tokens = new TokenSettings(tokensRoot, plugin as never, editor);
Object.assign(window, {
  fixture: {
    settings: () => current,
    failNext: () => {
      failNext = true;
    },
    addAssignedToken: () => {
      current = validateSettings({
        ...current,
        tokens: [...current.tokens, createToken("Agent three", "read-only")],
      });
    },
    copied: "",
  },
});
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: async (text: string) => {
      (window as unknown as { fixture: { copied: string } }).fixture.copied =
        text;
    },
  },
});
