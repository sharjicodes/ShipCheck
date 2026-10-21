import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function isPublicIp(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

/**
 * Best-effort application-level validation for the local MVP.
 * Production must additionally enforce outbound network restrictions at the
 * worker/container level to mitigate DNS rebinding and browser subrequest risks.
 */
export async function validatePublicUrl(
  raw: string,
  resolveHost: typeof lookup = lookup
): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid website URL, including https://.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing usernames or passwords are not allowed.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard HTTP/HTTPS ports are allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("That host is not allowed. Use a public website.");
  }

  // Block direct IPs unless every parsed address is globally routable unicast.
  if (ipaddr.isValid(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("Private or reserved IP addresses are not allowed.");
  } else {
    let records;
    try {
      records = await resolveHost(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("The hostname could not be resolved.");
    }
    if (records.length === 0 || records.some((record) => !isPublicIp(record.address))) {
      throw new Error("The hostname resolves to a private or reserved address and is not allowed.");
    }
  }

  url.hash = "";
  return url.toString();
}
