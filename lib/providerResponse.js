const { resolveMediaUrl } = require("./resolveMediaUrl");

function isDownloadResult(data, sourceUrl) {
  const source = resolveMediaUrl(sourceUrl);
  const seen = new Set();
  const ignoredKeys = /^(?:thumbnail(?:s|_url)?|thumb|cover(?:_url)?|avatar|poster|profile|author|origin(?:al)?_url|source(?:_url)?|webpage_url|permalink)$/i;
  const mediaKeys = /^(?:url|link|href|src|download(?:s|_?url|_?link)?|video(?:s|_?url)?|audio(?:s|_?url)?|photo(?:s|_?url)?|image(?:s|_?url)?|media|variants|formats|resources|play|play_url|preview|hd|sd|mp[34]|dlink|fast_download_link|direct_link)$/i;
  let visited = 0;

  function visit(value, key = "", depth = 0, mediaContext = false) {
    if (depth > 32 || ++visited > 10000 || ignoredKeys.test(key)) return false;
    if (typeof value === "string") {
      if (key && key !== "data" && !mediaContext && !mediaKeys.test(key)) return false;
      // Local opaque links are issued by the YouTube/Instagram adapters.
      if (/^\/api\/files\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return true;
      const url = resolveMediaUrl(value);
      return url !== null && url !== source;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    if (value.success === false || value.status === false) return false;
    if (typeof value.status === "string" && /^(error|failed|failure)$/i.test(value.status.trim())) return false;
    if (value.error && (typeof value.error !== "object" || Object.keys(value.error).length > 0)) return false;
    const isMedia = mediaContext || mediaKeys.test(key);
    if (Array.isArray(value)) return value.some((item) => visit(item, key, depth + 1, isMedia));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    // Wrapping empty or failed data in metadata cannot create a download.
    if (Object.hasOwn(value, "data")) return visit(value.data, "data", depth + 1, isMedia);
    return Object.entries(value).some(([childKey, item]) => visit(item, childKey, depth + 1, isMedia));
  }

  return visit(data);
}

module.exports = { isDownloadResult };
