const { Readable } = require("node:stream");
const { validateHlsUrl, MAX_DIRECT_BYTES } = require("./mediaTickets");

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SEGMENTS = 2000;

// This is intentionally a finite fMP4 audio playlist reader, not a general HLS
// player. Reject features that require decryption, remuxing, or range fetching.
function parseHlsManifest(text, baseUrl) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_MANIFEST_BYTES) throw new Error("HLS manifest exceeds its limit");
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim());
  if (lines[0] !== "#EXTM3U" || lines.at(-1) !== "#EXT-X-ENDLIST") throw new Error("Only complete VOD playlists are supported");
  let initialization;
  let pendingDuration = false;
  const segments = [];
  const resolve = (value) => {
    if (!value || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw new Error("Invalid HLS resource");
    return validateHlsUrl(new URL(value, baseUrl).href);
  };
  validateHlsUrl(baseUrl);
  for (const line of lines.slice(1, -1)) {
    if (!line) continue;
    if (/^#EXT-X-(?:KEY|SESSION-KEY|BYTERANGE|DISCONTINUITY|GAP|STREAM-INF|I-FRAME|MEDIA:|PART|PRELOAD|SKIP|ENDLIST)/.test(line)) {
      throw new Error("Unsupported HLS playlist feature");
    }
    if (line.startsWith("#EXT-X-PLAYLIST-TYPE:") && line !== "#EXT-X-PLAYLIST-TYPE:VOD") throw new Error("Only VOD playlists are supported");
    if (line.startsWith("#EXT-X-MAP:")) {
      const match = line.match(/^#EXT-X-MAP:URI="([^"\r\n]+)"$/);
      if (!match || initialization || segments.length || pendingDuration) throw new Error("Invalid fMP4 initialization map");
      initialization = resolve(match[1]);
    } else if (line.startsWith("#EXTINF:")) {
      if (pendingDuration || !/^#EXTINF:\d+(?:\.\d+)?,.*$/.test(line) || Number(line.slice(8).split(",")[0]) <= 0) throw new Error("Invalid HLS segment duration");
      pendingDuration = true;
    } else if (!line.startsWith("#")) {
      if (!initialization || !pendingDuration || segments.length >= MAX_SEGMENTS) throw new Error("Invalid or excessive HLS segments");
      segments.push(resolve(line));
      pendingDuration = false;
    }
  }
  if (!initialization || !segments.length || pendingDuration) throw new Error("Incomplete fMP4 audio playlist");
  return { initialization, segments };
}

async function readBounded(response, limit) {
  const parts = [];
  let size = 0;
  try {
    for await (const chunk of response.data) {
      size += chunk.length;
      if (size > limit) throw new Error("HLS metadata exceeds its limit");
      parts.push(Buffer.from(chunk));
    }
    return Buffer.concat(parts);
  } finally { response.data.destroy(); }
}

async function createHlsMediaStream(url, request, { maxBytes = MAX_DIRECT_BYTES, headOnly = false } = {}) {
  const manifest = await request(validateHlsUrl(url), MAX_MANIFEST_BYTES, validateHlsUrl);
  const text = (await readBounded(manifest, MAX_MANIFEST_BYTES)).toString("utf8");
  const resources = parseHlsManifest(text, manifest.url || url);
  // Validate the whole manifest before fetching even its initialization map.
  const initialization = await request(resources.initialization, Math.min(maxBytes, MAX_MANIFEST_BYTES), validateHlsUrl);
  const init = await readBounded(initialization, Math.min(maxBytes, MAX_MANIFEST_BYTES));
  if (init.length < 16 || init.subarray(4, 8).toString("ascii") !== "ftyp" || !init.includes(Buffer.from("moov"))) throw new Error("Invalid fMP4 initialization");
  let activeStream;
  let destroyed = false;
  const iterator = (async function* () {
    let received = init.length;
    yield init;
    if (headOnly) return;
    for (const url of resources.segments) {
      if (destroyed) return;
      const response = await request(url, maxBytes - received, validateHlsUrl);
      if (destroyed) { response.data.destroy(); return; }
      activeStream = response.data;
      let prefix = Buffer.alloc(0);
      let verified = false;
      let segmentBytes = 0;
      try {
        for await (const part of response.data) {
          const chunk = Buffer.from(part);
          received += chunk.length;
          segmentBytes += chunk.length;
          if (received > maxBytes) throw new Error("Media exceeds download size limit");
          if (!verified) {
            prefix = Buffer.concat([prefix, chunk]);
            if (prefix.length < 8) continue;
            if (!["moof", "styp", "sidx"].includes(prefix.subarray(4, 8).toString("ascii"))) throw new Error("Invalid fMP4 media segment");
            verified = true;
            yield prefix;
          } else yield chunk;
        }
        if (!verified || !segmentBytes) throw new Error("Empty HLS segment");
      } finally { response.data.destroy(); activeStream = null; }
    }
  })();
  // A generator's finally cannot run while its iterator is waiting on a stalled
  // network body. Close that body explicitly when the consumer disconnects.
  let reading = false;
  const output = new Readable({
    read() {
      if (reading) return;
      reading = true;
      iterator.next().then(({ value, done }) => {
        reading = false;
        if (!this.destroyed) this.push(done ? null : value);
      }).catch((error) => this.destroy(error));
    },
    destroy(error, callback) {
      destroyed = true;
      activeStream?.destroy();
      // Do not wait for a pending HTTP request before closing the consumer. Its
      // eventual response is also checked above and immediately destroyed.
      void iterator.return().catch(() => {});
      callback(error);
    },
  });
  return output;
}

module.exports = { createHlsMediaStream, parseHlsManifest };
