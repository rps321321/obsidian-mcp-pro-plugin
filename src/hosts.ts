import { isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { domainToASCII } from "node:url";

function invalidHost(): never {
  throw new TypeError(
    "Use a hostname or IP address, optionally with a port; omit schemes, paths, credentials, and wildcards.",
  );
}

function splitHostEntry(entry: string): { host: string; port?: string } {
  if (typeof entry !== "string" || /[\u0000-\u001f\u007f]/u.test(entry))
    invalidHost();
  const value = entry.trim();
  if (!value || /[\s/\\?#@%*]/u.test(value)) invalidHost();
  if (value.startsWith("[")) {
    const match = /^(\[[^\]]+\])(?::([^:]*))?$/.exec(value);
    if (!match) invalidHost();
    return { host: match[1]!, port: match[2] };
  }
  if (isIP(value) === 6) return { host: value };
  const parts = value.split(":");
  if (parts.length > 2) invalidHost();
  return { host: parts[0]!, port: parts[1] };
}

function canonicalHostname(host: string): string {
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (host.startsWith("[") || isIP(literal) === 6) {
    if (isIP(literal) !== 6) invalidHost();
    return new URL(`http://[${literal}]/`).hostname;
  }
  if (isIP(host) === 4) return host;
  const ascii = domainToASCII(host).toLowerCase();
  if (!ascii || isIP(ascii)) invalidHost();
  const name = ascii.endsWith(".") ? ascii.slice(0, -1) : ascii;
  if (
    name.length > 253 ||
    name
      .split(".")
      .some(
        (label) =>
          label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  )
    invalidHost();
  return ascii;
}

/** Canonical saved entry; invalid entries throw instead of disappearing. */
export function canonicalizeHostEntry(entry: string): string {
  const { host, port } = splitHostEntry(entry);
  const canonical = canonicalHostname(host);
  if (port === undefined) return canonical;
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new RangeError("An explicit host port must be between 1 and 65535.");
  }
  return `${canonical}:${Number(port)}`;
}

export function isValidHostEntry(entry: string): boolean {
  try {
    canonicalizeHostEntry(entry);
    return true;
  } catch {
    return false;
  }
}

/** Validate the complete list before returning a canonical copy. */
export function normalizeHostEntries(entries: readonly string[]): string[] {
  if (!Array.isArray(entries))
    throw new TypeError("Additional hosts must be a list.");
  return [...new Set(entries.map(canonicalizeHostEntry))];
}

/** Expand additions only; the core retains its own bind and loopback defaults. */
export function expandHosts(
  entries: readonly string[],
  port: number,
): string[] {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("The listening port must be between 0 and 65535.");
  }
  const expanded = new Set<string>();
  for (const entry of normalizeHostEntries(entries)) {
    expanded.add(entry);
    const parts = splitHostEntry(entry);
    if (parts.port === undefined && port !== 0)
      expanded.add(`${entry}:${port}`);
  }
  return [...expanded];
}

/** Enumerate local candidates only when the settings action invokes this function. */
export function detectMachineHosts(): string[] {
  const name = hostname();
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter(
        (entry) =>
          !entry.internal &&
          (entry.family === "IPv4" ||
            (entry.family === "IPv6" && entry.scopeid === 0)),
      )
      .map((entry) => entry.address),
  );
  const candidates = [name, name.split(".")[0]!, ...addresses];
  return normalizeHostEntries(candidates.filter(isValidHostEntry));
}
