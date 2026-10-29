const http = require("../lib/httpClient");
const ytDlp = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const { DownloadError } = require("../lib/downloadError");
const { validateUrl } = require("../lib/validateUrl");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "opus", "ogg", "webm"]);
const SOURCE_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "www.tiktokv.com"]);
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const INVALID_URL = "Enter a public TikTok video URL or a TikTok share link.";

function canonicalTikTokUrl(value) {
  let url;
  try { url = new URL(validateUrl(value)); }
  catch { throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL"); }
  if (url.port) throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL");
  if (SHORT_HOSTS.has(url.hostname) && /^\/[A-Za-z0-9_-]{1,64}\/?$/.test(url.pathname)) {
    return `https://${url.hostname}${url.pathname.replace(/\/$/, "")}/`;
  }
  if (!SOURCE_HOSTS.has(url.hostname)) throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL");
  if (/^\/@[A-Za-z0-9_.-]{0,128}\/photo\/\d+\/?$/.test(url.pathname)) {
    throw new DownloadError("TikTok photo slideshows are not supported. Use a public TikTok video link.", 400, "TIKTOK_PHOTOS_UNSUPPORTED");
  }
  const short = url.pathname.match(/^\/t\/([A-Za-z0-9_-]{1,64})\/?$/);
  if (short && url.hostname !== "www.tiktokv.com") return `https://www.tiktok.com/t/${short[1]}/`;
  const video = url.pathname.match(/^\/@([A-Za-z0-9_.-]{0,128})\/video\/(\d{1,25})\/?$/);
  const shared = url.pathname.match(/^\/(?:embed|share\/video)\/(\d{1,25})\/?$/);
  if (!video && !shared) throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL");
  return `https://www.tiktok.com/@${video?.[1] || "_"}/video/${video?.[2] || shared[1]}`;
}

function isShortUrl(url) {
  const parsed = new URL(url);
  return SHORT_HOSTS.has(parsed.hostname) || parsed.pathname.startsWith("/t/");
}

async function resolveTikTokUrl(value, signal) {
  let url = canonicalTikTokUrl(value);
  // Resolve every share-link hop ourselves. The extractor only receives a
  // canonical video URL, so a short link cannot redirect it to another site.
  for (let hop = 0; isShortUrl(url) && hop < 5; hop++) {
    const response = await http.head(url, {
      signal, maxRedirects: 0, validateStatus: () => true,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status) || typeof response.headers?.location !== "string") {
      throw new DownloadError("This TikTok share link no longer resolves to a video. Copy the original video's link and try again.", 422, "TIKTOK_SHARE_UNAVAILABLE");
    }
    const location = response.headers.location;
    if (/[\s\\\u0000-\u001f\u007f]/u.test(location)) throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL");
    let target;
    try { target = new URL(location, url).href; }
    catch { throw new DownloadError(INVALID_URL, 400, "INVALID_TIKTOK_URL"); }
    url = canonicalTikTokUrl(target);
  }
  if (isShortUrl(url)) throw new DownloadError("This TikTok share link redirects too many times. Use the original video's link.", 422, "TIKTOK_SHARE_UNAVAILABLE");
  return url;
}

function positive(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
function codec(value) { return typeof value === "string" && value.length > 0 && value !== "none"; }

function directFormats(info) {
  return (Array.isArray(info.formats) ? info.formats : []).filter((format) => {
    if (!format || format.has_drm || format.protocol !== "https" || format.fragments
        || positive(format.filesize) > mediaTickets.MAX_DIRECT_BYTES
        || /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(format.url || "")) return false;
    try { mediaTickets.validateMediaUrl(format.url); } catch { return false; }
    return true;
  });
}

async function fetchTikTokMedia(value, signal) {
  const sourceUrl = await resolveTikTokUrl(value, signal);
  const info = await ytDlp.extractInfo(sourceUrl, { extractor: "TikTok", signal });
  if (!info || typeof info !== "object" || Array.isArray(info) || info.entries || info._has_drm
      || info.is_live || info.live_status === "is_live" || (info._type && info._type !== "video")) {
    throw new DownloadError("TikTok returned no supported public video information.", 422, "TIKTOK_NO_MEDIA");
  }
  // Reverse equal-ranked variants to match yt-dlp's preference for its last
  // alternative CDN. Prefer H.264 for ordinary browser playback.
  const formats = directFormats(info).reverse();
  const videos = formats.filter((item) => VIDEO_EXTENSIONS.has(item.ext) && codec(item.vcodec));
  const complete = videos.filter((item) => codec(item.acodec));
  const selectedVideos = (complete.length ? complete : videos).sort((a, b) =>
    positive(b.height) - positive(a.height)
    || Number(!/^(?:h264|avc1)/i.test(a.vcodec)) - Number(!/^(?:h264|avc1)/i.test(b.vcodec))
    || positive(b.tbr) - positive(a.tbr));
  const audios = formats.filter((item) => AUDIO_EXTENSIONS.has(item.ext) && item.vcodec === "none" && codec(item.acodec))
    .sort((a, b) => positive(b.abr || b.tbr) - positive(a.abr || a.tbr));
  const seen = new Set();
  const selected = selectedVideos.filter((format) => {
    const key = positive(format.height);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4).map((format) => ({ format, type: "video" }));
  if (audios[0]) selected.push({ format: audios[0], type: "audio" });
  if (!selected.length) throw new DownloadError("No supported downloadable media was found. Try a public, unrestricted TikTok video.", 422, "TIKTOK_NO_MEDIA");

  const id = sourceUrl.split("/").at(-1);
  const downloads = selected.map(({ format, type }) => {
    const quality = type === "audio" ? "Audio only"
      : `${positive(format.height) ? `${format.height}p` : "Original"}${codec(format.acodec) ? "" : " (video only)"}`;
    const filename = `tiktok-${id}${type === "audio" ? "-audio" : positive(format.height) ? `-${format.height}p` : ""}.${format.ext}`;
    return {
      type, quality, text: quality, format: format.ext.toUpperCase(), filename,
      width: positive(format.width) || null, height: positive(format.height) || null,
      sizeBytes: positive(format.filesize) || null,
      url: mediaTickets.createMediaLink({
        url: format.url, headers: { ...info.http_headers, ...format.http_headers },
        cookies: format.cookies || info.cookies, filename,
      }),
    };
  });
  const thumbnail = resolveMediaUrl(info.thumbnail);
  return {
    status: true,
    title: typeof info.title === "string" ? info.title.slice(0, 500) : `TikTok video ${id}`,
    thumbnail: thumbnail?.startsWith("https://") ? thumbnail : null,
    duration: positive(info.duration) || null,
    downloads,
  };
}

async function fetchTikTokData(value, { signal } = {}) {
  const deadline = AbortSignal.timeout(ytDlp.EXTRACT_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try { return await fetchTikTokMedia(value, requestSignal); }
  catch (error) {
    if (deadline.aborted && requestSignal.reason === deadline.reason) {
      throw new DownloadError("TikTok took too long to respond. Please try again.", 504, "ETIMEDOUT");
    }
    throw error;
  }
}

module.exports = { fetchTikTokData, canonicalTikTokUrl, resolveTikTokUrl };
