import type { Plugin } from "obsidian";
import type { Settings } from "./settings-model";

export interface SettingsPlugin extends Plugin {
  readonly settings: Settings;
  updateSettings(change: (current: Settings) => Settings): Promise<void>;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const result = parent.ownerDocument.createElement(tag);
  result.textContent = text;
  result.className = className;
  parent.appendChild(result);
  return result;
}

export function button(
  parent: HTMLElement,
  label: string,
  action: () => void,
): HTMLButtonElement {
  const result = element(parent, "button", label);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}

export function message(parent: HTMLElement): HTMLDivElement {
  const result = element(parent, "div", "", "mcp-feedback");
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  return result;
}

export function field(
  parent: HTMLElement,
  label: string,
  value = "",
): HTMLInputElement {
  const wrapper = element(parent, "label", "", "mcp-field");
  element(wrapper, "span", label);
  const input = element(wrapper, "input");
  input.type = "text";
  input.value = value;
  return input;
}

export function roleOptions(
  select: HTMLSelectElement,
  settings: Settings,
  selected: string,
): void {
  select.replaceChildren();
  for (const role of settings.roles) {
    const option = element(select, "option", role.name);
    option.value = role.id;
  }
  select.value = selected;
}

export async function save(
  plugin: SettingsPlugin,
  feedback: HTMLElement,
  change: (current: Settings) => Settings,
): Promise<boolean> {
  feedback.textContent = "Saving…";
  try {
    await plugin.updateSettings(change);
    feedback.textContent = "Saved.";
    return true;
  } catch {
    feedback.textContent =
      "Could not apply this change. Check the current settings and try again. The server may be stopped; check its status before reconnecting.";
    return false;
  }
}

export function confirmInline(
  parent: HTMLElement,
  title: string,
  detail: string,
  label: string,
  action: () => Promise<void>,
): void {
  const returnFocus = parent.ownerDocument.activeElement;
  parent.replaceChildren();
  element(parent, "h4", title);
  element(parent, "p", detail);
  const actions = element(parent, "div", "", "mcp-actions");
  const cancel = button(actions, "Cancel", () => {
    parent.replaceChildren();
    const control = returnFocus as HTMLElement | null;
    if (control?.isConnected && typeof control.focus === "function")
      control.focus();
  });
  button(actions, label, () => {
    actions.querySelectorAll("button").forEach((control) => {
      control.disabled = true;
    });
    void action().finally(() => {
      actions.querySelectorAll("button").forEach((control) => {
        control.disabled = false;
      });
    });
  });
  cancel.focus();
}
