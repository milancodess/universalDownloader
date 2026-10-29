const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const { createTicketStore, validateMediaUrl } = require("../lib/mediaTickets");
const { createFileRouter } = require("../routes/files");

const MEDIA_URL = "https://r1.googlevideo.com/videoplayback?signature=private";
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(1024)]);
const response = (data = MP4, headers = {}, status = 200) => ({
  status, headers: { "content-type": "video/mp4", ...headers }, data: Readable.from([data]),
});

async function server(t, options) {
  const app = express();
  app.use("/api/files", createFileRouter(options));
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(() => new Promise((resolve) => { listener.close(resolve); listener.closeAllConnections(); }));
  return `http://127.0.0.1:${listener.address().port}`;
}

test("media tickets allow only supported HTTPS CDN URLs", () => {
  for (const url of [MEDIA_URL, "https://scontent.cdninstagram.com/photo.jpg", "https://video.xx.fbcdn.net/file.mp4", "https://cf-media.sndcdn.com/track.mp3", "https://playback.media-streaming.soundcloud.cloud/track.m3u8", "https://v19-webapp-prime.us.tiktok.com/video.mp4", "https://v16m.tiktokcdn-us.com/audio.mp3"]) {
    assert.equal(validateMediaUrl(url), url);
  }
  for (const url of ["http://r1.googlevideo.com/video", "https:////r1.googlevideo.com/video", "https://r1.googlevideo.com:8443/video", "https://r1.googlevideo.com.evil.test/video", "https://googlevideo.com@evil.test/", "https://user:password@r1.googlevideo.com/", "https://127.0.0.1/", "https://r1.googlevideo.com/\nvideo", "https://r1.googlevideo.com\\@evil.test"]) {
    assert.throws(() => validateMediaUrl(url), undefined, url);
  }
  for (const url of ["https://www.tiktok.com/video", "https://evil.tiktok.com/video", "https://sndcdn.com.evil.test/audio", "https://v19-webapp-prime.us.tiktok.com.evil.test/video", "https://evil.soundcloud.cloud/audio"]) assert.throws(() => validateMediaUrl(url));
});

test("TikTok tickets keep only scoped anonymous extractor cookies and strip serialized quotes", () => {
  const store = createTicketStore();
  const cookies = 'ttwid=publicid; Domain=.tiktok.com; Path=/; Secure; tt_chain_token="chain"; Domain=.tiktok.com; Path=/; Secure; sessionid=private; Domain=.tiktok.com; Path=/; Secure';
  const get = (options) => store.get(store.createLink(options).split("/").at(-1));
  assert.equal(get({ url: "https://v19-webapp-prime.us.tiktok.com/video", cookies }).cookies, "ttwid=publicid; tt_chain_token=chain");
  assert.equal(get({ url: MEDIA_URL, cookies }).cookies, null);
  for (const invalid of [cookies.replaceAll(".tiktok.com", ".evil.test"), cookies.replaceAll("Path=/", "Path=/private"), cookies.replaceAll("; Secure", ""), "ttwid=bad\r\nInjected: secret; Domain=.tiktok.com; Path=/; Secure"]) {
    assert.equal(get({ url: "https://v19-webapp-prime.us.tiktok.com/video", cookies: invalid }).cookies, null);
  }
});

test("TikTok transfer cookies never leave the original host or return after a cross-host redirect", async (t) => {
  const store = createTicketStore();
  const source = "https://v19-webapp-prime.us.tiktok.com/video";
  const path = store.createLink({ url: source, cookies: 'ttwid=anonymous; Domain=.tiktok.com; Path=/; Secure' });
  let calls = 0;
  const base = await server(t, { store, client: { get: async (url, options) => {
    calls++;
    assert.equal(options.headers.cookie, calls === 1 ? "ttwid=anonymous" : undefined);
    if (calls === 1) return response(Buffer.alloc(0), { location: "https://v16-webapp-prime.us.tiktok.com/video" }, 302);
    if (calls === 2) return response(Buffer.alloc(0), { location: source }, 302);
    return response();
  } } });
  const result = await fetch(base + path, { headers: { Cookie: "sessionid=never-forward" } });
  assert.equal(result.status, 200);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), MP4);
  assert.equal(calls, 3);
});

test("SoundCloud HLS attachments contain complete media bytes rather than a playlist", async (t) => {
  const source = "https://playback.media-streaming.soundcloud.cloud/audio/playlist.m3u8";
  const store = createTicketStore();
  const path = store.createLink({ url: source, kind: "hls", filename: "example.m4a" });
  const init = Buffer.concat([MP4, Buffer.from("moov")]);
  const part = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from("moof"), Buffer.alloc(32)]);
  const manifest = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\nsegment.m4s\n#EXT-X-ENDLIST\n';
  const requests = [];
  const base = await server(t, { store, client: { get: async (url) => {
    requests.push(url);
    return url.endsWith(".m3u8") ? response(Buffer.from(manifest), { "content-type": "application/vnd.apple.mpegurl" })
      : response(url.endsWith("init.mp4") ? init : part);
  } } });
  const result = await fetch(base + path);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /audio\/mp4/);
  assert.match(result.headers.get("content-disposition"), /example.m4a/);
  assert.equal(result.headers.get("content-length"), null);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), Buffer.concat([init, part]));
  assert.equal(requests.length, 3);
  requests.length = 0;
  const head = await fetch(base + path, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(requests.length, 2);
});

test("HLS manifest redirects cannot widen the SoundCloud CDN boundary", async (t) => {
  const store = createTicketStore();
  assert.throws(() => store.createLink({ url: MEDIA_URL, kind: "hls" }));
  const path = store.createLink({ url: "https://playback.media-streaming.soundcloud.cloud/a.m3u8", kind: "hls" });
  let requests = 0;
  const base = await server(t, { store, client: { get: async () => {
    requests++;
    return response(Buffer.alloc(0), { location: MEDIA_URL }, 302);
  } } });
  const result = await fetch(base + path);
  assert.equal(result.status, 502);
  assert.equal(requests, 1);
});

test("tickets are opaque, expire, stay bounded and do not forward cookies or unsafe headers", () => {
  let now = 0;
  const store = createTicketStore({ now: () => now, ttlMs: 100, maxTickets: 2 });
  const url = store.createLink({ url: MEDIA_URL, headers: { "User-Agent": "test-agent", Cookie: "secret", Authorization: "secret", Origin: "bad\r\nvalue" }, filename: "../bad\r\nname.mp4" });
  assert.match(url, /^\/api\/files\/[a-f0-9-]{36}$/);
  assert.equal(url.includes("signature"), false);
  const ticket = store.get(url.split("/").at(-1));
  assert.deepEqual(ticket.headers, { "accept-encoding": "identity", "user-agent": "test-agent" });
  assert.equal(/[\r\n\\/]/.test(ticket.filename), false);
  store.createLink({ url: MEDIA_URL });
  store.createLink({ url: MEDIA_URL });
  assert.equal(store.get(url.split("/").at(-1)), null);
  const last = store.createLink({ url: MEDIA_URL });
  now = 100;
  assert.equal(store.get(last.split("/").at(-1)), null);
});

test("file endpoint returns the actual bytes as an attachment, without leaking upstream URLs", async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL, filename: "Example video.mp4", headers: { "User-Agent": "extractor" } });
  const base = await server(t, { store, client: { get: async (url, config) => {
    assert.equal(url, MEDIA_URL);
    assert.equal(config.headers["user-agent"], "extractor");
    assert.equal(config.headers.cookie, undefined);
    assert.equal(config.maxRedirects, 0);
    assert.equal(config.decompress, false);
    return response(MP4, { "content-length": String(MP4.length) });
  } } });
  const result = await fetch(base + path, { headers: { Cookie: "do-not-forward" } });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-disposition"), /attachment; filename="Example video.mp4"/);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.headers.get("location"), null);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), MP4);
});

test("MP3 audio is served with its actual type even when the CDN labels it video/mp4", async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: "https://v16m.tiktokcdn-us.com/audio", filename: "audio.mp3" });
  const mp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0]), Buffer.alloc(1024)]);
  const base = await server(t, { store, client: { get: async () => response(mp3) } });
  const result = await fetch(base + path);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /^audio\/mpeg/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), mp3);
});

test("Unicode titles remain valid attachment filenames when truncated", async (t) => {
  const store = createTicketStore();
  for (const filename of ["a".repeat(159) + "😀" + "tail.mp4", "broken\ud800title.mp4"]) {
    const path = store.createLink({ url: MEDIA_URL, filename });
    const ticket = store.get(path.split("/").at(-1));
    assert.equal(ticket.filename.isWellFormed(), true);
    const base = await server(t, { store, client: { get: async () => response() } });
    const result = await fetch(base + path);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-disposition"), /^attachment;/);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), MP4);
  }
});

test("HEAD validates the media prefix and closes upstream without draining the file", { timeout: 3000 }, async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL });
  let sent = false;
  const data = new Readable({ read() {
    if (!sent) { sent = true; this.push(MP4); }
    // Leave the rest of this large file pending: HEAD must not consume it.
  } });
  const closed = once(data, "close");
  const base = await server(t, { store, client: { get: async () => ({
    status: 200, headers: { "content-type": "video/mp4", "content-length": "100000000" }, data,
  }) } });
  const result = await fetch(base + path, { method: "HEAD", signal: AbortSignal.timeout(2000) });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-length"), "100000000");
  assert.match(result.headers.get("content-disposition"), /^attachment;/);
  assert.equal((await result.arrayBuffer()).byteLength, 0);
  await closed;
  assert.equal(data.destroyed, true);
});

test("unknown and expired file tickets return 404 without requesting the provider", async (t) => {
  const base = await server(t, { store: createTicketStore(), client: { get: async () => assert.fail("must not request") } });
  assert.equal((await fetch(`${base}/api/files/not-a-ticket`)).status, 404);
});

test("CDN redirects are revalidated and external or looped redirects are stopped", async (t) => {
  for (const location of ["https://127.0.0.1/private", "https://googlevideo.com.evil.test/file", "/loop"]) {
    const store = createTicketStore();
    const path = store.createLink({ url: MEDIA_URL });
    let requests = 0;
    const base = await server(t, { store, client: { get: async () => {
      requests++;
      return response(Buffer.alloc(0), { location }, 302);
    } } });
    const result = await fetch(base + path);
    assert.equal(result.status, 502);
    assert.equal(requests, location === "/loop" ? 6 : 1);
    assert.equal((await result.text()).includes("private"), false);
  }
});

test("HTML errors, misleading MIME types, empty files and oversized files are not attachments", async (t) => {
  const cases = [
    response(Buffer.from("<html>upstream secret</html>"), { "content-type": "text/html" }),
    response(Buffer.from("<html>upstream secret</html>")),
    response(Buffer.alloc(0)),
    response(MP4, { "content-encoding": "gzip" }),
    response(MP4, { "content-length": "9999" }),
    response(MP4),
  ];
  for (const upstream of cases) {
    const store = createTicketStore();
    const path = store.createLink({ url: MEDIA_URL });
    const base = await server(t, { store, maxBytes: 512, client: { get: async () => upstream } });
    const result = await fetch(base + path);
    assert.equal(result.status, 502);
    assert.equal(result.headers.get("content-disposition"), null);
    assert.equal((await result.text()).includes("upstream secret"), false);
  }
});

test("absolute download deadline aborts a stalled provider", async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL });
  let aborted = false;
  const base = await server(t, { store, timeoutMs: 50, client: { get: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("stalled")); }, { once: true });
  }) } });
  const result = await fetch(base + path);
  assert.equal(result.status, 504);
  assert.equal(aborted, true);
});

test("client disconnect aborts the upstream request", { timeout: 3000 }, async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL });
  let markStarted;
  let markAborted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const base = await server(t, { store, client: { get: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { markAborted(); reject(new Error("cancelled")); }, { once: true });
    markStarted();
  }) } });
  const cancellation = new AbortController();
  const download = fetch(base + path, { signal: cancellation.signal });
  await started;
  cancellation.abort();
  await assert.rejects(download, { name: "AbortError" });
  await aborted;
});

test("streaming byte limit terminates an oversized file even without Content-Length", { timeout: 3000 }, async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL });
  const data = Readable.from((async function* () {
    yield MP4.subarray(0, 600);
    await new Promise((resolve) => setTimeout(resolve, 20));
    yield MP4.subarray(600);
  })());
  const closed = once(data, "close");
  const base = await server(t, { store, maxBytes: 700, client: { get: async () => ({ status: 200, headers: { "content-type": "video/mp4" }, data }) } });
  const result = await fetch(base + path);
  assert.equal(result.status, 200);
  await assert.rejects(result.arrayBuffer());
  await closed;
  assert.equal(data.destroyed, true);
});

test("media signature may span chunks and supported CDN redirects retain content", async (t) => {
  const store = createTicketStore();
  const path = store.createLink({ url: MEDIA_URL });
  let requests = 0;
  const base = await server(t, { store, client: { get: async (url) => {
    if (++requests === 1) return response(Buffer.alloc(0), { location: "https://r2.googlevideo.com/file" }, 302);
    assert.equal(url, "https://r2.googlevideo.com/file");
    return { status: 200, headers: { "content-type": "video/mp4" }, data: Readable.from([MP4.subarray(0, 3), MP4.subarray(3)]) };
  } } });
  const result = await fetch(base + path);
  assert.equal(result.status, 200);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), MP4);
  assert.equal(requests, 2);
});
