const assert = require("node:assert/strict");
const { test } = require("node:test");
const ytDlp = require("../lib/ytDlp");
const http = require("../lib/httpClient");
const mediaTickets = require("../lib/mediaTickets");
const { DownloadError } = require("../lib/downloadError");
const { fetchSoundcloudData, canonicalSoundCloudUrl } = require("../services/soundcloudService");

const sourceUrl = "https://soundcloud.com/nasa/apollo-11-thats-one-small-step-for-a-man";
const mediaUrl = "https://playback.media-streaming.soundcloud.cloud/track/playlist.m3u8?token=signed";
const hls = { format_id: "hls_aac_96k", ext: "m4a", vcodec: "none", acodec: "mp4a.40.2", abr: 96, protocol: "m3u8_native", url: mediaUrl };
const localUrl = "/api/files/12345678-1234-4234-8234-123456789012";

test("SoundCloud accepts public tracks and share links, strips tracking, and rejects profiles/playlists/deceptive input", () => {
  for (const value of [sourceUrl, sourceUrl + "/?si=tracking&in=nasa/sets/apollo#share", sourceUrl.replace("https://soundcloud", "http://m.soundcloud")]) {
    assert.equal(canonicalSoundCloudUrl(value), sourceUrl);
  }
  assert.equal(canonicalSoundCloudUrl("https://on.soundcloud.com/AbC123/?si=tracking"), "https://on.soundcloud.com/AbC123");
  for (const value of ["invalid", "https:///soundcloud.com/nasa/track", "https://soundcloud.com.evil.test/nasa/track", "https://api.soundcloud.com/tracks/123", "https://user:pass@soundcloud.com/nasa/track", "https://soundcloud.com:8080/nasa/track", "https://soundcloud.com/nasa", "https://soundcloud.com/nasa/sets", "https://soundcloud.com/nasa/sets/playlist", "https://soundcloud.com/nasa/track/s-private", "https://soundcloud.com/nasa/track?secret_token=secret", "https://soundcloud.com/search/tracks", "https://on.soundcloud.com/", "https://on.soundcloud.com/path/nested", "https://soundcloud.com/nasa/a\ntrack"]) {
    assert.throws(() => canonicalSoundCloudUrl(value), { code: "INVALID_SOUNDCLOUD_URL" }, value);
  }
});

test("SoundCloud registers complete HLS audio as an opaque attachment without exposing playlist URLs", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(ytDlp, "extractInfo", async (url, options) => {
    assert.equal(url, sourceUrl);
    assert.equal(options.extractor, "soundcloud");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return { id: "172034745", title: "Apollo 11", duration: 13.029, thumbnail: "https://i1.sndcdn.com/art.jpg", http_headers: { Referer: "https://soundcloud.com/" }, formats: [{ ...hls, http_headers: { "User-Agent": "extractor" } }] };
  });
  const register = t.mock.method(mediaTickets, "createMediaLink", (ticket) => {
    assert.deepEqual(ticket, { url: mediaUrl, filename: "soundcloud-172034745.m4a", kind: "hls", headers: { Referer: "https://soundcloud.com/", "User-Agent": "extractor" } });
    return localUrl;
  });
  const result = await fetchSoundcloudData(sourceUrl, { signal });
  assert.equal(result.status, true);
  assert.equal(result.duration, 13.029);
  assert.equal(result.medias[0].type, "audio");
  assert.equal(result.medias[0].url, localUrl);
  assert.equal(result.medias[0].quality, "96 kbps");
  assert.equal(result.medias[0].extension, "m4a");
  assert.equal(register.mock.callCount(), 1);
  assert.ok(!JSON.stringify(result).includes("token=signed"));
});

test("SoundCloud supports direct HTTPS audio, deduplicates formats and retains actual size", async (t) => {
  const direct = { format_id: "http_mp3_128k", ext: "mp3", vcodec: "none", protocol: "http", url: "https://cf-media.sndcdn.com/track.mp3", abr: 128, filesize: 1024 };
  t.mock.method(ytDlp, "extractInfo", async () => ({ id: "track", formats: [{ ...direct, abr: 64 }, direct, hls] }));
  const tickets = [];
  t.mock.method(mediaTickets, "createMediaLink", (ticket) => { tickets.push(ticket); return localUrl; });
  const result = await fetchSoundcloudData(sourceUrl);
  assert.deepEqual(result.medias.map((item) => item.quality), ["128 kbps", "96 kbps"]);
  assert.equal(result.medias[0].sizeBytes, 1024);
  assert.equal(tickets[0].kind, undefined);
  assert.equal(tickets[1].kind, "hls");
});

test("SoundCloud excludes previews, unsupported manifests, DRM, oversized and unsafe media", async (t) => {
  const rejected = [
    { ...hls, has_drm: true }, { ...hls, format_id: "hls_aac_96k_preview" }, { ...hls, format_note: "30 second preview" },
    { ...hls, url: "https://evil.test/playlist.m3u8" }, { ...hls, url: "https://playback.media-streaming.soundcloud.cloud.evil.test/file" },
    { ...hls, url: "http://playback.media-streaming.soundcloud.cloud/file" }, { ...hls, url: "https://user:pass@playback.media-streaming.soundcloud.cloud/file" },
    { ...hls, url: "https://playback.media-streaming.soundcloud.cloud:8080/file" }, { ...hls, format_id: "hls_mp3_128k", ext: "mp3" },
    { ...hls, protocol: "http" }, { ...hls, acodec: "none" }, { ...hls, vcodec: "h264" },
    { ...hls, filesize: mediaTickets.MAX_DIRECT_BYTES + 1 }, { ...hls, protocol: "dash" },
  ];
  t.mock.method(ytDlp, "extractInfo", async () => ({ formats: rejected }));
  const register = t.mock.method(mediaTickets, "createMediaLink", () => assert.fail("No unusable format may create a ticket"));
  await assert.rejects(fetchSoundcloudData(sourceUrl), { statusCode: 422, code: "SOUNDCLOUD_NO_MEDIA" });
  assert.equal(register.mock.callCount(), 0);
});

test("SoundCloud resolves share redirects only to validated public SoundCloud tracks", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(http, "get", async (url, options) => {
    assert.equal(url, "https://on.soundcloud.com/AbC123");
    assert.equal(options.maxRedirects, 0);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return { status: 302, headers: { location: sourceUrl + "?si=tracking" } };
  });
  t.mock.method(ytDlp, "extractInfo", async (url) => { assert.equal(url, sourceUrl); return { formats: [hls] }; });
  t.mock.method(mediaTickets, "createMediaLink", () => localUrl);
  assert.equal((await fetchSoundcloudData("https://on.soundcloud.com/AbC123", { signal })).medias[0].url, localUrl);
});

test("SoundCloud share resolution stops external, malformed and looping redirects before extraction", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => assert.fail("Invalid share must not be extracted"));
  for (const location of ["https://127.0.0.1/private", "https://soundcloud.com.evil.test/nasa/track", "https://soundcloud.com/nasa/sets", "https://soundcloud.com/nasa/tra\nck", "https://on.soundcloud.com/Loop"]) {
    const get = t.mock.method(http, "get", async () => ({ status: 302, headers: { location } }));
    await assert.rejects(fetchSoundcloudData("https://on.soundcloud.com/AbC123"), { code: "SOUNDCLOUD_SHARE_UNAVAILABLE" });
    assert.ok(get.mock.callCount() <= 3);
    get.mock.restore();
  }
  assert.equal(extract.mock.callCount(), 0);
});

test("SoundCloud rejects empty, playlist and protected results before issuing tickets", async (t) => {
  t.mock.method(mediaTickets, "createMediaLink", () => assert.fail("Unexpected ticket"));
  for (const result of [null, [], {}, { entries: [] }, { _type: "playlist", formats: [hls] }, { _has_drm: true, formats: [hls] }, { is_live: true, formats: [hls] }]) {
    const extract = t.mock.method(ytDlp, "extractInfo", async () => result);
    await assert.rejects(fetchSoundcloudData(sourceUrl), { statusCode: 422, code: "SOUNDCLOUD_NO_MEDIA" });
    extract.mock.restore();
  }
});

test("SoundCloud preserves actionable extractor errors and share-link request timeouts", async (t) => {
  const failure = new DownloadError("Request cancelled.", 499, "REQUEST_CANCELLED");
  t.mock.method(ytDlp, "extractInfo", async () => { throw failure; });
  await assert.rejects(fetchSoundcloudData(sourceUrl), (error) => error === failure);
  const timeout = Object.assign(new Error("Timed out"), { code: "ETIMEDOUT" });
  t.mock.method(http, "get", async () => { throw timeout; });
  await assert.rejects(fetchSoundcloudData("https://on.soundcloud.com/AbC123"), (error) => error === timeout);
});

test("SoundCloud uses one total deadline for share resolution and extraction without misclassifying caller cancellation", async (t) => {
  for (const stage of ["share", "extract", "caller"]) {
    const deadline = new AbortController();
    const caller = new AbortController();
    const timeout = t.mock.method(AbortSignal, "timeout", (milliseconds) => {
      assert.equal(milliseconds, ytDlp.EXTRACT_TIMEOUT_MS);
      return deadline.signal;
    });
    const aborted = new DownloadError("Request cancelled.", 499, "REQUEST_CANCELLED");
    const pending = async (url, { signal }) => {
      assert.equal(signal.aborted, false);
      if (stage === "caller") caller.abort(new Error("Client disconnected"));
      deadline.abort(new DOMException("Deadline elapsed", "TimeoutError"));
      assert.equal(signal.aborted, true);
      throw aborted;
    };
    const get = t.mock.method(http, "get", pending);
    const extract = t.mock.method(ytDlp, "extractInfo", pending);
    const source = stage === "share" ? "https://on.soundcloud.com/AbC123" : sourceUrl;
    await assert.rejects(fetchSoundcloudData(source, { signal: caller.signal }), stage === "caller"
      ? (error) => error === aborted
      : { statusCode: 504, code: "ETIMEDOUT" });
    assert.equal(get.mock.callCount(), stage === "share" ? 1 : 0);
    assert.equal(extract.mock.callCount(), stage === "share" ? 0 : 1);
    get.mock.restore(); extract.mock.restore(); timeout.mock.restore();
  }
});
