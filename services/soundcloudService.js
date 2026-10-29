const ytDlp = require("../lib/ytDlp");
const { EXTRACT_TIMEOUT_MS } = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const http = require("../lib/httpClient");
const { DownloadError } = require("../lib/downloadError");
const { validateUrl } = require("../lib/validateUrl");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

const AUDIO_EXTENSIONS = new Set(["m4a", "mp3", "aac", "opus", "ogg", "wav", "flac"]);
const HLS_HOST = "playback.media-streaming.soundcloud.cloud";
const COLLECTIONS = new Set(["tracks", "albums", "sets", "reposts", "likes", "spotlight", "comments"]);
const RESERVED_USERS = new Set(["discover", "search", "charts", "stream", "stations", "upload", "you"]);

function canonicalSoundCloudUrl(value) {
  let url;
  try { url = new URL(validateUrl(value)); } catch { /* Report a platform-specific input error below. */ }
  if (!url || url.port || url.searchParams.has("secret_token")) {
    throw new DownloadError("Enter a public SoundCloud track URL or a SoundCloud share link.", 400, "INVALID_SOUNDCLOUD_URL");
  }
  if (url.hostname === "on.soundcloud.com" && /^\/[A-Za-z0-9_-]{1,200}\/?$/.test(url.pathname)) {
    return "https://on.soundcloud.com" + url.pathname.replace(/\/$/, "");
  }
  const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/);
  if (!["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"].includes(url.hostname)
      || !match || RESERVED_USERS.has(match[1].toLowerCase()) || COLLECTIONS.has(match[2].toLowerCase())) {
    throw new DownloadError("Use a public SoundCloud track, rather than a profile, playlist, or another website.", 400, "INVALID_SOUNDCLOUD_URL");
  }
  return `https://soundcloud.com/${match[1]}/${match[2]}`;
}

async function resolveTrackUrl(value, signal) {
  let url = canonicalSoundCloudUrl(value);
  for (let redirects = 0; new URL(url).hostname === "on.soundcloud.com"; redirects++) {
    if (redirects >= 3) throw new DownloadError("This SoundCloud share link could not be resolved. Paste the full track URL instead.", 422, "SOUNDCLOUD_SHARE_UNAVAILABLE");
    const response = await http.get(url, { signal, maxRedirects: 0, validateStatus: () => true });
    if (![301, 302, 303, 307, 308].includes(response.status) || typeof response.headers?.location !== "string") {
      throw new DownloadError("This SoundCloud share link could not be resolved. Paste the full track URL instead.", 422, "SOUNDCLOUD_SHARE_UNAVAILABLE");
    }
    // Validate each redirect before making another request; never let a short
    // link turn this endpoint into a fetcher for arbitrary destinations.
    const location = response.headers.location;
    if (/[\s\\\u0000-\u001f\u007f]/u.test(location)) throw new DownloadError("Invalid SoundCloud share redirect.", 422, "SOUNDCLOUD_SHARE_UNAVAILABLE");
    try { url = canonicalSoundCloudUrl(new URL(location, url).href); }
    catch { throw new DownloadError("This share link does not lead to a public SoundCloud track.", 422, "SOUNDCLOUD_SHARE_UNAVAILABLE"); }
  }
  return url;
}

function selectFormats(info) {
  const candidates = (Array.isArray(info.formats) ? info.formats : []).filter((format) => {
    if (!format || typeof format !== "object" || format.has_drm || format.vcodec !== "none"
        || format.acodec === "none" || !AUDIO_EXTENSIONS.has(format.ext)
        || /preview|snipped/i.test(`${format.format_id || ""} ${format.format_note || ""}`)
        || (Number.isFinite(format.filesize) && format.filesize > mediaTickets.MAX_DIRECT_BYTES)) return false;
    const safe = resolveMediaUrl(format.url);
    if (!safe) return false;
    const url = new URL(safe);
    if (url.protocol !== "https:" || url.port) return false;
    if (format.protocol === "m3u8_native") {
      return url.hostname === HLS_HOST && format.ext === "m4a" && /^hls_aac(?:_|$)/.test(format.format_id || "");
    }
    return ["https", "http"].includes(format.protocol) && !format.fragments
      && !/\.(?:m3u8|mpd)(?:[?#]|$)/i.test(safe)
      && (url.hostname === "sndcdn.com" || url.hostname.endsWith(".sndcdn.com") || url.hostname === HLS_HOST);
  });
  candidates.sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
  const seen = new Set();
  return candidates.filter((format) => {
    if (seen.has(format.ext)) return false;
    seen.add(format.ext);
    return true;
  }).slice(0, 3);
}

async function extractSoundcloudData(value, signal) {
  const sourceUrl = await resolveTrackUrl(value, signal);
  const info = await ytDlp.extractInfo(sourceUrl, { extractor: "soundcloud", signal });
  if (!info || typeof info !== "object" || Array.isArray(info) || info.entries
      || info._type === "playlist" || info.is_live || info._has_drm || info.has_drm) {
    throw new DownloadError("No public, complete audio track was available at this SoundCloud link.", 422, "SOUNDCLOUD_NO_MEDIA");
  }
  const formats = selectFormats(info);
  if (!formats.length) {
    throw new DownloadError("No complete downloadable audio was found. This track may require sign-in, offer only a preview, or use an unsupported stream format.", 422, "SOUNDCLOUD_NO_MEDIA");
  }
  const id = String(info.id || "track").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "track";
  const medias = formats.map((format) => {
    const filename = `soundcloud-${id}.${format.ext}`;
    return {
      url: mediaTickets.createMediaLink({ url: format.url, filename,
        headers: { ...info.http_headers, ...format.http_headers },
        ...(format.protocol === "m3u8_native" ? { kind: "hls" } : {}),
      }),
      type: "audio", extension: format.ext, format: format.ext, filename,
      quality: Number.isFinite(format.abr) && format.abr > 0 ? `${format.abr} kbps` : "Audio",
      ...(Number.isFinite(format.filesize) && format.filesize > 0 ? { sizeBytes: format.filesize } : {}),
    };
  });
  return {
    status: true, source: "soundcloud",
    title: typeof info.title === "string" ? info.title.slice(0, 500) : null,
    thumbnail: resolveMediaUrl(info.thumbnail),
    duration: Number.isFinite(info.duration) && info.duration > 0 ? info.duration : null,
    medias,
  };
}

async function fetchSoundcloudData(value, { signal } = {}) {
  // Resolving a share link and extracting metadata share one deadline, so a
  // redirect chain cannot silently add another 45 seconds to the browser wait.
  const deadline = AbortSignal.timeout(EXTRACT_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try { return await extractSoundcloudData(value, requestSignal); }
  catch (error) {
    if (deadline.aborted && requestSignal.reason === deadline.reason) {
      throw new DownloadError("SoundCloud took too long to respond. Please try again.", 504, "ETIMEDOUT");
    }
    throw error;
  }
}

module.exports = { fetchSoundcloudData, canonicalSoundCloudUrl };
