import { isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { domainToASCII } from "node:url";

const HOSTNAME_RE = /^[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]*[a-z0-9\u00a1-\uffff])?(\.[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]*[a-z0-9\u00a1-\uffff])?)*$/i;

interface HostParts {
  host: string;
  port?: string;
}

/**
 * Split a `Host` value into host and port. Bracketed IPv6 keeps its brackets;
 * a bare IPv6 literal has no port to split off. Returns null for anything that
 * is not one host with at most one port — schemes, paths, `*`, and spaces all
 * land here.
 */
function splitHostPort(entry: string): HostParts | null {
  if (!entry || /[\s/\\?#@]/.test(entry)) return null;
  if (entry.startsWith("[")) {
    const close = entry.indexOf("]");
    if (close < 0) return null;
    const rest = entry.slice(close + 1);
    if (!rest) return { host: entry };
    if (!rest.startsWith(":")) return null;
    return { host: entry.slice(0, close + 1), port: rest.slice(1) };
  }
  if (isIP(entry) === 6) return { host: entry };
  const colon = entry.indexOf(":");
  if (colon < 0) return { host: entry };
  if (entry.indexOf(":", colon + 1) >= 0) return null;
  return { host: entry.slice(0, colon), port: entry.slice(colon + 1) };
}

/**
 * Whether an entry is a `Host` header value the library will accept. The
 * library throws at startup on schemes, paths, and `*`, which would leave the
 * user with a server that refuses to start, so reject them in the settings tab
 * instead. `*` is not a wildcard anywhere in this stack.
 */
export function isValidHostEntry(entry: string): boolean {
  const parts = splitHostPort(entry);
  if (!parts) return false;
  if (parts.port !== undefined) {
    if (!/^\d{1,5}$/.test(parts.port)) return false;
    const port = Number(parts.port);
    if (port < 1 || port > 65535) return false;
  }
  if (parts.host.startsWith("[")) return isIP(parts.host.slice(1, -1)) === 6;
  if (isIP(parts.host)) return true;
  return HOSTNAME_RE.test(parts.host);
}

/**
 * The single form of a host a client can actually reach the server with.
 *
 * `@hono/node-server`, which the SDK's Node transport wraps, rebuilds the
 * request URL from the `Host` header and rejects the request with an empty 400
 * whenever `new URL()` normalizes that header — so a `Host` carrying uppercase
 * letters or Unicode never reaches the allowlist at all, however it is spelled
 * there. Canonicalize to lowercase punycode, and bracket bare IPv6 literals to
 * match the form a `Host` header carries.
 */
function canonicalHost(host: string): string {
  if (host.startsWith("[")) return host.toLowerCase();
  if (isIP(host) === 6) return `[${host.toLowerCase()}]`;
  if (isIP(host)) return host;
  return domainToASCII(host) || host.toLowerCase();
}

/**
 * Configured entries plus the port-qualified forms the library needs. Deriving
 * them at start instead of persisting them keeps the settings list editable and
 * lets a bare entry follow a port change. Invalid entries are dropped: the
 * library throws on them, and a server that will not start is worse than a host
 * that is not allowed.
 */
export function expandHosts(entries: string[], port: number): string[] {
  const expanded = new Set<string>();
  for (const entry of entries) {
    const parts = splitHostPort(entry);
    if (!parts || !isValidHostEntry(entry)) continue;
    const host = canonicalHost(parts.host);
    if (parts.port !== undefined) {
      expanded.add(`${host}:${parts.port}`);
      continue;
    }
    expanded.add(host);
    expanded.add(`${host}:${port}`);
  }
  return [...expanded];
}

/**
 * This machine's full hostname, short hostname, and non-loopback IPv4
 * addresses, for the settings tab's detect button. Never applied
 * automatically: reaching the server on these addresses requires a
 * non-loopback bind or a proxy, so the user asks for them explicitly.
 */
export function detectMachineHosts(): string[] {
  const localHostname = hostname();
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address),
  );
  return [...new Set([localHostname, localHostname.split(".")[0]!, ...addresses])].filter(Boolean);
}
