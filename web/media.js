(function (root) {
  "use strict";

  const domains = {
    bluesky: ["bsky.app"],
    capcut: ["capcut.com"],
    dailymotion: ["dailymotion.com", "dai.ly"],
    douyin: ["douyin.com", "iesdouyin.com"],
    meta: ["instagram.com", "facebook.com", "fb.watch", "fb.com"],
    kuaishou: ["kuaishou.com", "kwai.com"],
    linkedin: ["linkedin.com", "lnkd.in"],
    pinterest: ["pinterest.com", "pin.it"],
    reddit: ["reddit.com", "redd.it"],
    snapchat: ["snapchat.com"],
    soundcloud: ["soundcloud.com", "on.soundcloud.com"],
    spotify: ["spotify.com", "spotify.link"],
    terabox: ["terabox.com", "teraboxapp.com", "1024tera.com", "teraboxlink.com"],
    threads: ["threads.net", "threads.com"],
    tiktok: ["tiktok.com"],
    tumblr: ["tumblr.com"],
    twitter: ["twitter.com", "x.com", "t.co"],
    youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  };

  function safeUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\/[^/?#]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
    try {
      const parsed = new URL(value);
      return parsed.hostname && !parsed.username && !parsed.password ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function detectPlatform(value) {
    const url = safeUrl(value);
    if (!url) return null;
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return Object.keys(domains).find((platform) => domains[platform].some((domain) =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    )) || null;
  }

  function extractMediaLinks(data, sourceUrl) {
    const links = [];
    const seen = new Set();
    const source = safeUrl(sourceUrl);
    const ignoredKeys = /^(?:thumbnail(?:s|_url)?|thumb|cover(?:_url)?|avatar|poster|profile|author|origin(?:al)?_url|source(?:_url)?|webpage_url|permalink)$/i;
    const mediaKeys = /^(?:url|link|href|src|download(?:s|_?url|_?link)?|video(?:s|_?url)?|audio(?:s|_?url)?|photo(?:s|_?url)?|image(?:s|_?url)?|media|variants|formats|resources|play|play_url|preview|hd|sd|mp[34]|dlink|fast_download_link|direct_link)$/i;
    let visited = 0;

    function walk(value, key, parent, depth) {
      if (depth > 12 || links.length >= 100 || ++visited > 10000 || ignoredKeys.test(key)) return;
      if (typeof value === "string") {
        // Only app-issued opaque file references may be relative. Other media
        // links still require an absolute, credential-free HTTP(S) URL.
        const localFile = /^\/api\/files\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
        const url = localFile ? value : safeUrl(value);
        if (!url || url === source || seen.has(url) || (key !== "" && key !== "data" && !mediaKeys.test(key))) return;
        seen.add(url);
        const kind = /audio|mp3/i.test(key) ? "Audio" : /photo|image/i.test(key) ? "Photo" : /video|mp4/i.test(key) ? "Video" : "Media";
        const labels = parent && typeof parent === "object"
          ? [parent.text, parent.label, parent.quality, parent.resolution, parent.format, parent.type].filter((label) => typeof label === "string" && label.trim())
          : [];
        const label = [...new Set(labels)].join(" / ").slice(0, 160) || `${kind} ${links.length + 1}`;
        links.push({ url, label });
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item, key, item, depth + 1);
      } else if (value && typeof value === "object") {
        const hasMediaCollection = ["videos", "audios", "downloads", "photos", "images"].some((name) => Array.isArray(value[name]) && value[name].length);
        for (const [childKey, item] of Object.entries(value)) {
          // Providers may canonicalize the submitted page URL. It is metadata,
          // not another download choice when actual media collections exist.
          if (childKey === "url" && hasMediaCollection) continue;
          walk(item, childKey, value, depth + 1);
        }
      }
    }
    walk(data, "", null, 0);
    return links;
  }

  // Keep provider quirks out of the view. Missing metadata stays missing; the
  // format picker must never promise audio, resolution, or file sizes it lacks.
  function normalizeMedia(data, sourceUrl) {
    const links = extractMediaLinks(data, sourceUrl);
    const metadata = new Map();
    const visitedObjects = new WeakSet();
    const ignoredKeys = /^(?:thumbnail(?:s|_url)?|thumb|cover(?:_url)?|avatar|poster|profile|author|origin(?:al)?_url|source(?:_url)?|webpage_url|permalink)$/i;
    const mediaExtensions = /^(?:mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|ogg|opus|wav|flac|jpg|jpeg|png|webp|gif|avif|heic|heif)$/i;
    let visited = 0;
    let title = "";
    let thumbnail = null;
    let duration = null;

    function text(value, length = 160) {
      return typeof value === "string" ? value.trim().slice(0, length) : "";
    }

    function kindOf(value) {
      if (/^(?:audio|audios|mp3|m4a)$/i.test(value)) return "audio";
      if (/^(?:photo|photos|image|images)$/i.test(value)) return "photo";
      if (/^(?:video|videos|mp4)$/i.test(value)) return "video";
      return "";
    }

    function formatOf(record, url) {
      const declared = text(record.format || record.ext, 12).toLowerCase();
      if (mediaExtensions.test(declared)) return declared;
      const filename = text(record.filename, 512) || (safeUrl(url) ? new URL(url).pathname : "");
      const extension = filename.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      return extension && mediaExtensions.test(extension) ? extension : "";
    }

    function byteCount(value, multiplier = 1) {
      if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
      const bytes = Number(value) * multiplier;
      return Number.isFinite(bytes) && bytes > 0 && bytes <= Number.MAX_SAFE_INTEGER ? Math.round(bytes) : null;
    }

    function sizeOf(record) {
      for (const key of ["sizeBytes", "size_bytes", "filesize", "filesize_approx"]) {
        const size = byteCount(record[key]);
        if (size !== null) return size;
      }
      // The local YouTube adapter reports sizeMB as bytes / 1024 / 1024.
      const megabytes = byteCount(record.sizeMB, 1024 ** 2);
      if (megabytes !== null) return megabytes;
      const raw = record.size;
      const plain = byteCount(raw);
      if (plain !== null) return plain;
      const match = typeof raw === "string" && raw.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|KiB|MiB|GiB)$/i);
      if (!match) return null;
      const unit = match[2].toLowerCase();
      const exponent = { b: 0, kb: 1, mb: 2, gb: 3, kib: 1, mib: 2, gib: 3 }[unit];
      return byteCount(match[1], (unit.includes("i") ? 1024 : 1000) ** exponent);
    }

    function preparationMetadata(record, local) {
      const result = {};
      // Only opaque, app-issued routes can start a local preparation job.
      if (local && record.preparation === true) result.preparation = true;
      if (record.estimated === true) result.estimated = true;
      for (const key of ["width", "height"]) {
        if (Number.isInteger(record[key]) && record[key] > 0 && record[key] <= 32768) result[key] = record[key];
      }
      if (typeof record.fps === "number" && Number.isFinite(record.fps) && record.fps > 0 && record.fps <= 1000) result.fps = record.fps;
      for (const key of ["videoCodec", "audioCodec"]) {
        if (typeof record[key] === "string" && /^[a-z0-9._-]{1,64}$/i.test(record[key])) result[key] = record[key];
      }
      return result;
    }

    function walk(value, key, parent, inheritedKind, depth) {
      if (depth > 12 || ++visited > 10000 || ignoredKeys.test(key)) return;
      const collectionKind = kindOf(key) || inheritedKind;
      if (typeof value === "string") {
        const local = /^\/api\/files\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
        const url = local ? value : safeUrl(value);
        if (!url || metadata.has(url)) return;
        const record = parent && typeof parent === "object" && !Array.isArray(parent) ? parent : {};
        const format = formatOf(record, url);
        const formatKind = /^(?:mp3|m4a|aac|ogg|opus|wav|flac)$/.test(format) ? "audio"
          : /^(?:jpg|jpeg|png|webp|gif|avif|heic|heif)$/.test(format) ? "photo"
            : /^(?:mp4|m4v|mov|webm|mkv|avi)$/.test(format) ? "video" : "";
        metadata.set(url, {
          kind: kindOf(record.type) || collectionKind || formatKind || "file",
          format,
          quality: text(record.quality || record.resolution),
          sizeBytes: sizeOf(record),
          local,
          ...preparationMetadata(record, local),
        });
      } else if (value && typeof value === "object") {
        if (visitedObjects.has(value)) return;
        visitedObjects.add(value);
        if (Array.isArray(value)) {
          for (const item of value) walk(item, key, item, collectionKind, depth + 1);
          return;
        }
        if (!title) title = text(value.title || value.caption, 500);
        if (!thumbnail) {
          for (const candidate of [value.thumbnail, value.thumbnail_url, value.thumb, value.cover_url, value.poster]) {
            thumbnail = safeUrl(candidate);
            if (thumbnail) break;
          }
        }
        if (duration === null && typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration >= 0) duration = value.duration;
        const objectKind = kindOf(value.type) || collectionKind;
        for (const [childKey, item] of Object.entries(value)) walk(item, childKey, value, objectKind, depth + 1);
      }
    }

    walk(data, "", null, "", 0);
    return {
      title,
      thumbnail,
      duration,
      platform: detectPlatform(sourceUrl),
      items: links.map((link) => ({
        ...link,
        ...(metadata.get(link.url) || { kind: "file", format: "", quality: "", sizeBytes: null, local: false }),
      })),
    };
  }

  const api = { safeUrl, detectPlatform, extractMediaLinks, normalizeMedia };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DownloaderMedia = api;
})(globalThis);
