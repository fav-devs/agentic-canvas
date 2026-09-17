/**
 * Rewrite an internal/insecure storage URL to the authenticated `/api/media`
 * proxy so the browser can load it over HTTPS.
 *
 * Prod MinIO is served from an internal, http-only host
 * (`bucket.railway.internal:9000`) that the browser can't load (mixed content).
 * Any media URL shown in the UI must go through the proxy. Blob/data/proxy URLs
 * and already-public HTTPS URLs are left untouched.
 */
export function toDisplayMediaUrl(url: string | null | undefined): string {
  if (!url) return url ?? "";
  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/api/media/")
  ) {
    return url;
  }
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://app";
    const u = new URL(url, base);
    const isInternal =
      u.protocol === "http:" ||
      u.hostname.endsWith("railway.internal") ||
      u.port === "9000" ||
      u.hostname.includes("minio") ||
      u.hostname === "localhost";
    if (isInternal) {
      return `/api/media/${u.pathname.replace(/^\//, "")}`;
    }
    return url;
  } catch {
    return url;
  }
}
