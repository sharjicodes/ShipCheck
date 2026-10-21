import { validatePublicUrl } from "../../../api/src/url-safety.js";

export async function isAllowedBrowserRequest(
  requestUrl: string,
  submittedUrl: string,
  resolveHost?: Parameters<typeof validatePublicUrl>[1]
): Promise<boolean> {
  try {
    const target = new URL(requestUrl);
    const submitted = new URL(submittedUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    if (target.hostname !== submitted.hostname) return false;
    if (target.port && !["80", "443"].includes(target.port)) return false;
    await validatePublicUrl(requestUrl, resolveHost);
    return true;
  } catch {
    return false;
  }
}
