function isDownloadResult(data) {
  if (typeof data === "string") {
    // Reddit returns a direct download URL; HTML/error text is never media data.
    if (!/^https?:\/\//i.test(data) || /[\s\\]/.test(data)) return false;
    try {
      const url = new URL(data);
      return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
    } catch {
      return false;
    }
  }

  if (!data || typeof data !== "object") return false;
  if (data.success === false || data.status === false) return false;
  if (Array.isArray(data)) return data.length > 0;

  const prototype = Object.getPrototypeOf(data);
  return (prototype === Object.prototype || prototype === null)
    && Object.keys(data).length > 0;
}

module.exports = { isDownloadResult };
