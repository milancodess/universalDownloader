const express = require("express");
const axios = require("axios");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { mediaTickets, validateMediaUrl, MAX_DIRECT_BYTES } = require("../lib/mediaTickets");
const { createHlsMediaStream } = require("../lib/hlsMedia");

const ALLOWED_CONTENT = /^(?:video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|image\/(?:jpeg|png|gif|webp|avif|heic|heif)|application\/octet-stream)$/i;

function hasMediaSignature(bytes) {
  if (bytes.length < 4) return false;
  return bytes.subarray(4, 8).toString("ascii") === "ftyp" ||
    bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || // WebM
    bytes.subarray(0, 4).toString("ascii") === "OggS" ||
    bytes.subarray(0, 4).toString("ascii") === "fLaC" ||
    bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || // MPEG/ADTS audio
    bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || // JPEG
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    /^GIF8[79]a/.test(bytes.subarray(0, 6).toString("ascii")) ||
    (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      ["WAVE", "WEBP"].includes(bytes.subarray(8, 12).toString("ascii")));
}

function createFileRouter({
  store = mediaTickets,
  client = axios.create(),
  maxBytes = MAX_DIRECT_BYTES,
  timeoutMs = 5 * 60 * 1000,
  inactivityTimeoutMs = 15000,
} = {}) {
  const router = express.Router();
  router.get("/:id", async (req, res) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    const ticket = store.get(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: "This download link has expired. Find downloads again." });

    const disconnected = new AbortController();
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([disconnected.signal, deadline]);
    const onClose = () => { if (!res.writableEnded) disconnected.abort(); };
    res.once("close", onClose);
    let upstream;
    const connections = new Set();
    const request = async (source, limitBytes = maxBytes, validate = validateMediaUrl) => {
      let url = source;
      let allowCookies = new URL(source).hostname === new URL(ticket.url).hostname;
      let response;
      for (let redirects = 0; redirects <= 5; redirects++) {
        validate(url);
        response = await client.get(url, {
          responseType: "stream", headers: { ...ticket.headers, ...(allowCookies && ticket.cookies ? { cookie: ticket.cookies } : {}) },
          timeout: inactivityTimeoutMs, signal, maxRedirects: 0,
          decompress: false,
          maxContentLength: limitBytes, maxBodyLength: 0,
          validateStatus: () => true,
        });
        const connection = response.data;
        connections.add(connection);
        connection.once("close", () => connections.delete(connection));
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          response.data.destroy();
          const location = response.headers.location;
          if (redirects === 5 || typeof location !== "string" || /[\s\\\u0000-\u001f\u007f]/u.test(location)) {
            throw new Error("Invalid media redirect");
          }
          const redirected = validate(new URL(location, url).href);
          if (new URL(redirected).hostname !== new URL(url).hostname) allowCookies = false;
          url = redirected;
          continue;
        }
        break;
      }
      if (response.status !== 200) throw new Error("Media provider did not return a complete file");
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") throw new Error("Unexpected media content encoding");
      const size = response.headers["content-length"];
      if (size !== undefined && (!/^\d+$/.test(String(size)) || Number(size) > limitBytes)) throw new Error("Media exceeds download size limit");
      return { ...response, url };
    };
    try {
      upstream = ticket.kind === "hls"
        ? { data: await createHlsMediaStream(ticket.url, request, { maxBytes, headOnly: req.method === "HEAD" }), headers: { "content-type": "audio/mp4" } }
        : await request(ticket.url);
      const type = String(upstream.headers["content-type"] || "").split(";")[0].trim();
      if (!ALLOWED_CONTENT.test(type)) throw new Error("Provider response is not media");
      const size = upstream.headers["content-length"];
      if (size !== undefined && (!/^\d+$/.test(String(size)) || Number(size) > maxBytes)) throw new Error("Media exceeds download size limit");

      // Inspect the actual bytes before sending attachment headers. Some providers
      // serve an HTML error page with a misleading video or octet-stream MIME type.
      const iterator = upstream.data[Symbol.asyncIterator]();
      const chunks = [];
      let received = 0;
      let done = false;
      while (received < 512) {
        const next = await iterator.next();
        if (next.done) { done = true; break; }
        const chunk = Buffer.from(next.value);
        received += chunk.length;
        if (received > maxBytes) throw new Error("Media exceeds download size limit");
        chunks.push(chunk);
      }
      const prefix = Buffer.concat(chunks);
      if (!hasMediaSignature(prefix)) throw new Error("Provider did not return a recognizable media file");

      res.attachment(ticket.filename);
      // TikTok serves its MP3 audio with a video/mp4 header. Prefer an actual
      // MPEG/ADTS signature over that misleading label for browser playback.
      const mpegAudio = prefix.subarray(0, 3).toString("ascii") === "ID3"
        || prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0;
      res.type(mpegAudio ? (prefix[0] === 0xff && (prefix[1] & 0xf6) === 0xf0 ? "audio/aac" : "audio/mpeg") : type);
      if (size !== undefined && !upstream.headers["content-encoding"]) res.setHeader("Content-Length", size);
      // Express maps HEAD to this GET handler. Once the prefix is validated,
      // finish the headers instead of downloading an entire body we cannot send.
      if (req.method === "HEAD") return res.end();
      const body = Readable.from((async function* () {
        yield prefix;
        while (!done) {
          const next = await iterator.next();
          if (next.done) break;
          received += next.value.length;
          if (received > maxBytes) throw new Error("Media exceeds download size limit");
          yield next.value;
        }
      })());
      await pipeline(body, res, { signal });
    } catch (error) {
      if (disconnected.signal.aborted || res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      res.removeHeader("Content-Disposition");
      res.removeHeader("Content-Length");
      const timedOut = deadline.aborted || ["ECONNABORTED", "ETIMEDOUT"].includes(error.code);
      res.status(timedOut ? 504 : 502).json({
        success: false,
        error: timedOut
          ? "The download timed out. Please try again."
          : "Unable to download this file. Find downloads again to refresh the link.",
      });
    } finally {
      res.removeListener("close", onClose);
      upstream?.data.destroy();
      for (const stream of connections) stream.destroy();
    }
  });
  return router;
}

module.exports = createFileRouter();
module.exports.createFileRouter = createFileRouter;
