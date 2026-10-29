const ytDlp = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const { DownloadError } = require("../lib/downloadError");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

const MAX_MEDIA = 20;
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "m4v", "mov"]);
const AUDIO_EXTENSIONS = new Set(["m4a", "mp3", "aac", "opus", "ogg", "webm"]);

function selectPhoto(entry) {
  // yt-dlp's Instagram extractor exposes public photo candidates as thumbnails
  // when --ignore-no-formats-error is enabled. Do not turn an unavailable video
  // or DRM-protected asset into a claimed successful photo download.
  if (!Array.isArray(entry.formats) || entry.formats.length || entry._has_drm
    || entry.is_video === true || entry.media_type === 2
    || Number(entry.duration) > 0 || Number(entry.video_duration) > 0
    || (entry.vcodec && entry.vcodec !== "none")) return null;
  const candidates = [entry.thumbnail, ...(Array.isArray(entry.thumbnails) ? [...entry.thumbnails].reverse().map((item) => item?.url) : [])];
  for (const candidate of candidates) {
    const url = resolveMediaUrl(candidate);
    if (!url?.startsWith("https://")) continue;
    try { mediaTickets.validateMediaUrl(url); } catch { continue; }
    const extension = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i)?.[1];
    if (extension) return { url, ext: extension.toLowerCase(), http_headers: entry.http_headers };
  }
  return null;
}

function canonicalInstagramUrl(value) {
  let parsed;
  try {
    if (typeof value !== "string" || value.length > 8192 || !/^https?:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw new Error("Malformed URL");
    parsed = new URL(value);
  } catch {
    throw new DownloadError("Enter a complete Instagram post or reel URL.", 400, "INVALID_INSTAGRAM_URL");
  }
  const match = parsed.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{1,64})\/?$/);
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(parsed.hostname)
    || parsed.port || parsed.username || parsed.password || !match
  ) {
    throw new DownloadError("Use an Instagram post or reel link, rather than a profile, story, or another website.", 400, "INVALID_INSTAGRAM_URL");
  }
  return `https://www.instagram.com/p/${match[2]}/`;
}

function directFormats(entry) {
  return (Array.isArray(entry.formats) ? entry.formats : []).filter((format) => {
    if (!format || typeof format !== "object" || format.has_drm) return false;
    if (Number.isFinite(format.filesize) && format.filesize > mediaTickets.MAX_DIRECT_BYTES) return false;
    const url = resolveMediaUrl(format.url);
    try { mediaTickets.validateMediaUrl(url); } catch { return false; }
    return url?.startsWith("https://")
      && (!format.protocol || format.protocol === "https")
      && !format.fragments
      && !/\.(?:m3u8|mpd)(?:[?#]|$)/i.test(url);
  });
}

function resolution(format) {
  return Number.isFinite(format.height) && format.height > 0 ? format.height : 0;
}

function selectFormats(entry) {
  const formats = directFormats(entry);
  const videos = formats.filter((format) => format.vcodec !== "none" && VIDEO_EXTENSIONS.has(format.ext));
  const audios = formats.filter((format) => format.vcodec === "none" && format.acodec !== "none" && AUDIO_EXTENSIONS.has(format.ext));
  const combined = videos.filter((format) => format.acodec && format.acodec !== "none");
  const sortedVideos = (combined.length ? combined : videos).sort((a, b) => resolution(b) - resolution(a));
  const video = sortedVideos[0];
  if (!video) {
    const photo = selectPhoto(entry);
    return photo ? [{ format: photo, type: "photo" }] : [];
  }
  const selected = [{ format: video, type: "video" }];
  // Keep a separate audio track visible when the source offers no combined file.
  // Claiming that a silent video stream includes sound would be misleading.
  if (!combined.length && video.acodec === "none" && audios.length) {
    audios.sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
    selected.push({ format: audios[0], type: "audio" });
  }
  return selected;
}

async function fetchInstagramData(url, { signal } = {}) {
  const canonicalUrl = canonicalInstagramUrl(url);
  const info = await ytDlp.extractInfo(canonicalUrl, { extractor: "Instagram", signal });
  if (!info || typeof info !== "object") {
    throw new DownloadError("Instagram returned no media information. Try another public post.", 502, "INSTAGRAM_UNAVAILABLE");
  }
  const entries = Array.isArray(info.entries) ? info.entries.slice(0, MAX_MEDIA) : [info];
  const data = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const selected = selectFormats(entry);
    if (data.length + selected.length > MAX_MEDIA) break;
    for (const { format, type } of selected) {
      const id = String(entry.id || canonicalUrl.split("/").at(-2)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
      const filename = `instagram-${id}${type === "audio" ? "-audio" : ""}.${format.ext}`;
      const isSeparateVideo = type === "video" && format.acodec === "none";
      data.push({
        type,
        url: mediaTickets.createMediaLink({
          url: format.url,
          headers: { ...entry.http_headers, ...format.http_headers },
          filename,
        }),
        filename,
        thumbnail: resolveMediaUrl(entry.thumbnail || info.thumbnail),
        quality: type === "photo" ? "Image" : type === "audio" ? "Audio only" : `${resolution(format) ? `${resolution(format)}p` : "Original"}${isSeparateVideo ? " (video only)" : ""}`,
      });
    }
  }
  if (!data.length) {
    throw new DownloadError("No downloadable media was found in this Instagram post. Check that the post is public and still available.", 422, "INSTAGRAM_NO_MEDIA");
  }
  let title = typeof info.title === "string" ? info.title : null;
  if (data.every((item) => item.type === "photo") && info.channel && title === `Video by ${info.channel}`) title = `Post by ${info.channel}`;
  return { status: true, title, data };
}

module.exports = { fetchInstagramData, canonicalInstagramUrl };
