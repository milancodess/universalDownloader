const { randomUUID } = require("node:crypto");

const MEDIA_HOSTS = ["googlevideo.com", "cdninstagram.com", "fbcdn.net"];
const MAX_DIRECT_BYTES = 512 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORWARDED_HEADERS = new Set(["user-agent", "accept", "accept-language", "referer", "origin"]);

function validateMediaUrl(value) {
  if (typeof value !== "string" || value.length > 32768 || !/^https:\/\/[^/?#]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Invalid media URL");
  }
  let url;
  try { url = new URL(value); } catch { throw new Error("Invalid media URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !MEDIA_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error("Media URL is outside the supported CDN domains");
  }
  return url.href;
}

function mediaHeaders(headers = {}) {
  const result = { "accept-encoding": "identity" };
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (FORWARDED_HEADERS.has(name) && typeof value === "string" && value.length <= 8192 &&
        !/[\u0000-\u001f\u007f]/u.test(value)) result[name] = value;
  }
  return result;
}

function mediaFilename(value) {
  const filename = String(value || "download.mp4").toWellFormed().replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, "_").trim();
  const extension = filename.match(/\.(mp4|webm|m4a|mp3|aac|ogg|opus|flac|wav|jpe?g|png|gif|webp|avif|heic|heif)$/i)?.[0];
  const suffix = extension || ".bin";
  const stem = Array.from((extension ? filename.slice(0, -extension.length) : filename).replace(/[. ]+$/u, "")).slice(0, 160).join("") || "download";
  return `${stem}${suffix}`;
}

function createTicketStore({ ttlMs = 30 * 60 * 1000, maxTickets = 500, now = Date.now } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isInteger(maxTickets) || maxTickets < 1) {
    throw new Error("Invalid media ticket limits");
  }
  const tickets = new Map();
  function prune() {
    const time = now();
    for (const [id, ticket] of tickets) if (ticket.expiresAt <= time) tickets.delete(id);
  }
  return {
    createLink({ url, headers, filename }) {
      const ticket = Object.freeze({
        url: validateMediaUrl(url),
        headers: Object.freeze(mediaHeaders(headers)),
        filename: mediaFilename(filename),
        expiresAt: now() + ttlMs,
      });
      prune();
      while (tickets.size >= maxTickets) tickets.delete(tickets.keys().next().value);
      const id = randomUUID();
      tickets.set(id, ticket);
      return `/api/files/${id}`;
    },
    get(id) {
      if (!UUID.test(id)) return null;
      const ticket = tickets.get(id);
      if (!ticket) return null;
      if (ticket.expiresAt <= now()) { tickets.delete(id); return null; }
      return ticket;
    },
  };
}

const mediaTickets = createTicketStore();
const createMediaLink = (options) => mediaTickets.createLink(options);

module.exports = { createMediaLink, createTicketStore, mediaTickets, validateMediaUrl, mediaFilename, MAX_DIRECT_BYTES };
