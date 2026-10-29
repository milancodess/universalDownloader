const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("../lib/httpClient");
const ytDlp = require("../lib/ytDlp");
const tickets = require("../lib/mediaTickets");
const { DownloadError } = require("../lib/downloadError");
const { fetchTikTokData, canonicalTikTokUrl, resolveTikTokUrl } = require("../services/tiktokService");

const source = "https://www.tiktok.com/@creator/video/7047596209028074758";
const media = "https://v19-webapp-prime.us.tiktok.com/video.mp4";
const video = { url: media, ext: "mp4", protocol: "https", width: 576, height: 1024, vcodec: "h264", acodec: "aac", tbr: 1000 };
const audio = { url: "https://v16m.tiktokcdn-us.com/music.mp3", ext: "mp3", protocol: "https", vcodec: "none", acodec: "mp3", abr: 128 };
const local = "/api/files/11111111-1111-4111-8111-111111111111";

test("TikTok canonicalizes only individual videos and platform shortlinks", () => {
  for (const input of [source, source + "?utm_source=share#tracking", source.replace("www.", "m.").replace("https:", "http:")]) {
    assert.equal(canonicalTikTokUrl(input), source);
  }
  for (const path of ["embed", "share/video"]) {
    assert.equal(canonicalTikTokUrl(`https://www.tiktok.com/${path}/7047596209028074758/`), source.replace("@creator", "@_"));
  }
  assert.equal(canonicalTikTokUrl("https://vm.tiktok.com/ZTest/?x=1"), "https://vm.tiktok.com/ZTest/");
  assert.equal(canonicalTikTokUrl("https://tiktok.com/t/ZTest"), "https://www.tiktok.com/t/ZTest/");
  for (const input of ["not a url", "https://tiktok.com.evil.test/@creator/video/123", "https://user:secret@tiktok.com/@creator/video/123", "https://tiktok.com:8443/@creator/video/123", "https://tiktok.com/@creator", "https://tiktok.com/@creator/live", "https://tiktok.com/music/track-123", "https://vm.tiktok.com/path/other", source + "/extra", source.replace("7047", "7047\\")]) {
    assert.throws(() => canonicalTikTokUrl(input), { code: "INVALID_TIKTOK_URL" }, input);
  }
  assert.throws(() => canonicalTikTokUrl(source.replace("/video/", "/photo/")), { code: "TIKTOK_PHOTOS_UNSUPPORTED" });
});

test("TikTok resolves share links with every redirect validated before extraction", async (t) => {
  const controller = new AbortController();
  const requests = [];
  t.mock.method(http, "head", async (url, options) => {
    requests.push(url);
    assert.equal(options.maxRedirects, 0);
    assert.ok(options.signal instanceof AbortSignal);
    return { status: 302, headers: { location: requests.length === 1 ? "https://www.tiktok.com/t/Second/" : source + "?share=1" } };
  });
  t.mock.method(ytDlp, "extractInfo", async (url, options) => {
    assert.equal(url, source);
    assert.equal(options.extractor, "TikTok");
    assert.equal(options.signal.aborted, false);
    return { formats: [video] };
  });
  t.mock.method(tickets, "createMediaLink", () => local);
  assert.equal((await fetchTikTokData("https://vm.tiktok.com/First/", { signal: controller.signal })).downloads[0].url, local);
  assert.deepEqual(requests, ["https://vm.tiktok.com/First/", "https://www.tiktok.com/t/Second/"]);
});

test("TikTok never follows external, credential-bearing, malformed, or looping share redirects", async (t) => {
  const head = t.mock.method(http, "head", async () => ({ status: 302, headers: { location: "http://127.0.0.1/secret" } }));
  for (const location of ["http://127.0.0.1/secret", "https://evil.test/@creator/video/123", "https://user:secret@www.tiktok.com/@creator/video/123", "https://www.tiktok.com/\\@evil.test/", "https://www.tiktok.com/@creator/video/123\n"]) {
    head.mock.mockImplementation(async () => ({ status: 302, headers: { location } }));
    await assert.rejects(resolveTikTokUrl("https://vm.tiktok.com/First/"), { code: "INVALID_TIKTOK_URL" });
  }
  head.mock.mockImplementation(async () => ({ status: 302, headers: { location: "https://vm.tiktok.com/Loop/" } }));
  const before = head.mock.callCount();
  await assert.rejects(resolveTikTokUrl("https://vm.tiktok.com/Loop/"), { code: "TIKTOK_SHARE_UNAVAILABLE" });
  assert.equal(head.mock.callCount() - before, 5);
  head.mock.mockImplementation(async () => ({ status: 200, headers: {} }));
  await assert.rejects(resolveTikTokUrl("https://vm.tiktok.com/First/"), { code: "TIKTOK_SHARE_UNAVAILABLE" });
});

test("TikTok returns typed opaque video/audio tickets and keeps anonymous cookies server-side", async (t) => {
  const cookies = 'ttwid=public-session; Domain=.tiktok.com; Path=/; Secure; tt_chain_token="value="; Domain=.tiktok.com; Path=/; Secure';
  t.mock.method(ytDlp, "extractInfo", async () => ({ title: "A public video", duration: 21, thumbnail: "https://p16.tiktokcdn.com/cover.jpg", http_headers: { Referer: source }, formats: [
    { ...video, url: media + "?first", tbr: 2000 },
    { ...video, url: media + "?last", tbr: 2000, cookies, http_headers: { "User-Agent": "extractor" } },
    { ...video, url: media + "?h265", vcodec: "h265", tbr: 3000 },
    { ...video, height: 2160, acodec: "none" }, audio,
  ] }));
  const register = t.mock.method(tickets, "createMediaLink", (ticket) => {
    if (ticket.filename.endsWith(".mp4")) {
      assert.equal(ticket.url, media + "?last");
      assert.equal(ticket.cookies, cookies);
      assert.deepEqual(ticket.headers, { Referer: source, "User-Agent": "extractor" });
    }
    return local;
  });
  const result = await fetchTikTokData(source);
  assert.equal(result.status, true);
  assert.deepEqual(result.downloads.map((entry) => entry.type), ["video", "audio"]);
  assert.equal(result.downloads[0].height, 1024);
  assert.equal(result.downloads[1].format, "MP3");
  assert.equal(register.mock.callCount(), 2);
  assert.ok(!JSON.stringify(result).includes("public-session"));
  assert.ok(!JSON.stringify(result).includes("?last"));
});

test("TikTok rejects unsafe, oversized, encrypted, fragmented, and manifest formats", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => ({ formats: [
    { ...video, url: "https://evil.test/video.mp4" },
    { ...video, url: "https://user:password@v19-webapp-prime.us.tiktok.com/video.mp4" },
    { ...video, protocol: "m3u8_native" }, { ...video, url: media + ".m3u8" },
    { ...video, has_drm: true }, { ...video, fragments: [{}] },
    { ...video, filesize: tickets.MAX_DIRECT_BYTES + 1 },
    { ...video, vcodec: "none", acodec: "none" }, null,
  ] }));
  const register = t.mock.method(tickets, "createMediaLink", () => local);
  await assert.rejects(fetchTikTokData(source), { code: "TIKTOK_NO_MEDIA" });
  assert.equal(register.mock.callCount(), 0);
  extract.mock.mockImplementation(async () => ({ formats: [{ ...video, filesize_approx: tickets.MAX_DIRECT_BYTES + 1 }] }));
  assert.equal((await fetchTikTokData(source)).downloads.length, 1);
});

test("TikTok audio-only and silent-video results do not fabricate media or sound", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => ({ thumbnail: "javascript:alert(1)", formats: [audio] }));
  t.mock.method(tickets, "createMediaLink", () => local);
  const result = await fetchTikTokData(source);
  assert.equal(result.thumbnail, null);
  assert.deepEqual(result.downloads.map((entry) => entry.type), ["audio"]);
  extract.mock.mockImplementation(async () => ({ formats: [{ ...video, acodec: "none" }] }));
  assert.equal((await fetchTikTokData(source)).downloads[0].quality, "1024p (video only)");
});

test("TikTok rejects live, playlist and malformed metadata without issuing tickets", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => null);
  const register = t.mock.method(tickets, "createMediaLink", () => local);
  for (const result of [null, [], {}, { entries: [] }, { _type: "playlist" }, { is_live: true, formats: [video] }, { _has_drm: true, formats: [video] }]) {
    extract.mock.mockImplementation(async () => result);
    await assert.rejects(fetchTikTokData(source), { code: "TIKTOK_NO_MEDIA" });
  }
  assert.equal(register.mock.callCount(), 0);
});

test("TikTok preserves actionable extractor errors and cancellation", async (t) => {
  const error = new DownloadError("This post requires sign-in.", 422, "MEDIA_RESTRICTED");
  const extract = t.mock.method(ytDlp, "extractInfo", async () => { throw error; });
  await assert.rejects(fetchTikTokData(source), (actual) => actual === error);
  const controller = new AbortController();
  controller.abort();
  extract.mock.mockImplementation(async (url, options) => {
    assert.equal(options.signal.aborted, true);
    throw options.signal.reason;
  });
  await assert.rejects(fetchTikTokData(source, { signal: controller.signal }), (actual) => actual === controller.signal.reason);
});

test("TikTok classifies its overall extraction deadline as 504", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (milliseconds) => milliseconds === ytDlp.EXTRACT_TIMEOUT_MS
    ? AbortSignal.abort(new DOMException("Timed out", "TimeoutError")) : timeout(milliseconds));
  t.mock.method(ytDlp, "extractInfo", async (url, options) => { throw options.signal.reason; });
  await assert.rejects(fetchTikTokData(source), { code: "ETIMEDOUT", statusCode: 504 });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchTikTokData(source, { signal: controller.signal }), (error) => error === controller.signal.reason);
});
