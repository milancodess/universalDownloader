const ytDlp = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const youtubeJobs = require("../lib/youtubeJobs");
const { DownloadError } = require("../lib/downloadError");
const { validateUrl } = require("../lib/validateUrl");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

const INVALID_URL = "Enter a public YouTube video link (watch, Shorts, live recording, or youtu.be).";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const FORMAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const MAX_MERGED_BYTES = 4 * 1024 ** 3;

function canonicalizeYouTubeUrl(value) {
  let parsed;
  try {
    parsed = new URL(validateUrl(value));
  } catch {
    throw new DownloadError(INVALID_URL, 400, "INVALID_MEDIA_URL");
  }
  if (parsed.port) throw new DownloadError(INVALID_URL, 400, "INVALID_MEDIA_URL");
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const path = parsed.pathname.split("/").filter(Boolean);
  const isYouTube = host === "youtube.com" || host.endsWith(".youtube.com");
  const isEmbedHost = host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
  let id;
  if ((host === "youtu.be" || host === "www.youtu.be") && path.length === 1) {
    id = path[0];
  } else if (isYouTube && path.length === 1 && path[0] === "watch" && parsed.searchParams.getAll("v").length === 1) {
    id = parsed.searchParams.get("v");
  } else if ((isYouTube || isEmbedHost) && path.length === 2 && ["shorts", "live", "embed"].includes(path[0])) {
    id = path[1];
  }
  if (!VIDEO_ID.test(id || "")) throw new DownloadError(INVALID_URL, 400, "INVALID_MEDIA_URL");
  return `https://www.youtube.com/watch?v=${id}`;
}

function validCodec(value) {
  return typeof value === "string" && value.length > 0 && value !== "none";
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function directFormat(format) {
  if (!format || typeof format !== "object" || format.protocol !== "https" || format.has_drm || format.fragments) return false;
  const url = resolveMediaUrl(format.url);
  if (!url?.startsWith("https://") || typeof format.ext !== "string" || !/^[a-z0-9]{1,5}$/.test(format.ext)) return false;
  try { mediaTickets.validateMediaUrl(url); } catch { return false; }
  return true;
}

function chooseFormats(formats, kind, limit) {
  const candidates = formats.filter((format) => directFormat(format) && validCodec(format.acodec)
    && numberOrZero(format.filesize) <= mediaTickets.MAX_DIRECT_BYTES
    && (kind === "video" ? validCodec(format.vcodec) : format.vcodec === "none"));
  candidates.sort((a, b) => kind === "video"
    ? numberOrZero(b.height) - numberOrZero(a.height) || numberOrZero(b.tbr) - numberOrZero(a.tbr)
    : numberOrZero(b.abr || b.tbr) - numberOrZero(a.abr || a.tbr));
  const seen = new Set();
  return candidates.filter((format) => {
    const key = kind === "video" ? numberOrZero(format.height) : format.ext;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function formatSize(format) {
  return numberOrZero(format.filesize) || numberOrZero(format.filesize_approx);
}

function videoCodecRank(codec, height) {
  // H.264 is broadly playable at HD; YouTube normally uses VP9/AV1 for 4K.
  // Preserve the source stream without upscaling or a lossy transcode.
  if (/^(?:avc1|h264)/i.test(codec)) return height <= 1080 ? 0 : 1;
  if (/^(?:vp9|vp09)/i.test(codec)) return height <= 1080 ? 1 : 0;
  if (/^(?:av01|av1)/i.test(codec)) return 2;
  return 99;
}

function chooseAdaptiveFormats(formats) {
  const audio = formats.filter((format) => directFormat(format) && FORMAT_ID.test(format.format_id || "")
    && format.vcodec === "none" && /^(?:mp4a|aac)/i.test(format.acodec || "")
    && ["m4a", "mp4"].includes(format.ext));
  audio.sort((a, b) => {
    // Keep the original/preferred language, then prefer ordinary stereo AAC-LC.
    const preference = (value) => typeof value === "number" && Number.isFinite(value) ? value : -1;
    const stereo = (format) => numberOrZero(format.audio_channels) <= 2 ? 0 : 1;
    const lc = (format) => /^mp4a\.40\.2$/i.test(format.acodec) ? 0 : 1;
    const drc = (format) => /\bdrc\b/i.test(`${format.format_id} ${format.format_note || ""}`) ? 1 : 0;
    return preference(b.language_preference) - preference(a.language_preference)
      || stereo(a) - stereo(b) || lc(a) - lc(b) || drc(a) - drc(b)
      || numberOrZero(b.abr || b.tbr) - numberOrZero(a.abr || a.tbr);
  });
  if (!audio.length) return [];
  const audioFormat = audio[0];
  const candidates = formats.filter((format) => directFormat(format) && FORMAT_ID.test(format.format_id || "")
    && format.acodec === "none" && validCodec(format.vcodec)
    && ["mp4", "webm"].includes(format.ext)
    && Number.isInteger(format.height) && format.height >= 720 && format.height <= 2160
    && Number.isInteger(format.width) && format.width > 0 && format.width <= 7680
    && videoCodecRank(format.vcodec, format.height) < 99
    && formatSize(format) + formatSize(audioFormat) <= MAX_MERGED_BYTES);
  candidates.sort((a, b) => b.height - a.height
    || videoCodecRank(a.vcodec, a.height) - videoCodecRank(b.vcodec, b.height)
    || numberOrZero(b.fps) - numberOrZero(a.fps)
    || numberOrZero(b.tbr) - numberOrZero(a.tbr));
  const heights = new Set();
  return candidates.filter((format) => {
    if (heights.has(format.height)) return false;
    heights.add(format.height);
    return true;
  }).map((videoFormat) => ({ videoFormat, audioFormat }));
}

async function fetchYouTubeData(value, { signal } = {}) {
  const url = canonicalizeYouTubeUrl(value);
  const id = new URL(url).searchParams.get("v");
  const info = await ytDlp.extractInfo(url, { extractor: "youtube", signal });
  if (!info || typeof info !== "object" || info.id !== id || info.entries
    || ![undefined, "video"].includes(info._type)
    || String(info.extractor_key || info.extractor || "").toLowerCase() !== "youtube") {
    throw new DownloadError("YouTube returned an invalid video response. Please try another public link.");
  }
  if (info.is_live || ["is_live", "is_upcoming"].includes(info.live_status)) {
    throw new DownloadError("Live streams and scheduled videos are not supported. Try a finished YouTube video.", 400, "LIVE_NOT_SUPPORTED");
  }
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const videoFormats = chooseFormats(formats.filter((format) => numberOrZero(format?.height) <= 2160), "video", 5);
  const adaptiveFormats = chooseAdaptiveFormats(formats);
  const audioFormats = chooseFormats(formats, "audio", 2);
  if (!videoFormats.length && !adaptiveFormats.length && !audioFormats.length) {
    throw new DownloadError("No downloadable video or audio was available. Try another public YouTube link.");
  }
  const title = typeof info.title === "string" ? info.title : null;
  const filenameBase = (title || id).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").slice(0, 100).replace(/[. ]+$/, "") || id;
  function mediaItem(format, kind) {
    const size = formatSize(format);
    const height = numberOrZero(format.height);
    const bitrate = numberOrZero(format.abr || format.tbr);
    const quality = kind === "video" ? (height ? `${height}p` : "Video with audio") : (bitrate ? `${Math.round(bitrate)} kbps` : "Audio");
    return {
      format: format.ext,
      quality,
      url: mediaTickets.createMediaLink({
        url: format.url,
        headers: { ...info.http_headers, ...format.http_headers },
        filename: `${filenameBase}-${id}-${quality.replace(/\s+/g, "_")}.${format.ext}`,
      }),
      sizeMB: size ? +(size / 1024 / 1024).toFixed(2) : null,
    };
  }
  function adaptiveItem({ videoFormat, audioFormat }) {
    const size = formatSize(videoFormat) && formatSize(audioFormat) ? formatSize(videoFormat) + formatSize(audioFormat) : null;
    const height = videoFormat.height;
    const quality = height === 2160 ? "2160p (4K)" : `${height}p`;
    const metadata = {
      height, width: videoFormat.width, fps: numberOrZero(videoFormat.fps) || null,
      videoCodec: videoFormat.vcodec, audioCodec: audioFormat.acodec,
    };
    return {
      format: "mp4", quality, ...metadata, preparation: true, audioIncluded: true, estimated: true,
      url: youtubeJobs.createYouTubeJobLink({
        sourceUrl: url, videoId: id,
        videoFormatId: videoFormat.format_id, audioFormatId: audioFormat.format_id,
        duration: numberOrZero(info.duration) || null,
        ...metadata,
        filename: `${filenameBase}-${id}-${height}p.mp4`, estimatedBytes: size,
      }),
      sizeMB: size ? +(size / 1024 / 1024).toFixed(2) : null,
    };
  }
  // Keep ready-to-download combined files when the same source resolution exists.
  const progressiveHeights = new Set(videoFormats.map((format) => numberOrZero(format.height)));
  const choices = [
    ...videoFormats.map((format) => ({ height: numberOrZero(format.height), create: () => mediaItem(format, "video") })),
    ...adaptiveFormats.filter(({ videoFormat }) => !progressiveHeights.has(videoFormat.height))
      .map((pair) => ({ height: pair.videoFormat.height, create: () => adaptiveItem(pair) })),
  ].sort((a, b) => b.height - a.height).slice(0, 5);
  return {
    type: "video",
    url,
    thumbnail: resolveMediaUrl(info.thumbnail),
    title,
    duration: typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration >= 0 ? info.duration : null,
    videos: choices.map((choice) => choice.create()),
    audios: audioFormats.map((format) => mediaItem(format, "audio")),
  };
}

module.exports = { fetchYouTubeData, canonicalizeYouTubeUrl };
