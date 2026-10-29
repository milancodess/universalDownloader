// Scraped links may be relative to the provider page, but must never become
// executable browser links or credential-bearing URLs in a successful result.
function resolveMediaUrl(value, baseUrl) {
  if (typeof value !== "string" || !value || value.startsWith("#")) return null;
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;

  // WHATWG URL repairs malformed absolute URLs such as https:///host. Reject
  // these before parsing, while still allowing ordinary relative page links.
  if (/^https?:/i.test(value) && !/^https?:\/\/[^/?#]/i.test(value)) return null;

  try {
    const url = baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

module.exports = { resolveMediaUrl };
