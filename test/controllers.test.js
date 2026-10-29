const assert = require("node:assert/strict");
const test = require("node:test");
const { createDownloadController } = require("../lib/downloadController");
const { validateUrl, MAX_URL_LENGTH } = require("../lib/validateUrl");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("URL validation preserves encoded queries and accepts short platform aliases", () => {
  for (const url of [
    "https://youtu.be/example?si=a%2Bb&feature=share",
    "http://pin.it/example",
    "https://www.threads.com/@example/post/abc",
    "HTTPS://example.com/video?id=123#part",
  ]) {
    assert.equal(validateUrl(` ${url} `), url);
  }
});

test("URL validation rejects malformed, ambiguous and credential-bearing input", () => {
  for (const value of [
    undefined,
    null,
    "",
    "   ",
    [],
    ["https://example.com/a", "https://example.com/b"],
    { host: "example.com" },
    42,
    "example.com/a",
    "/a",
    "https:/example.com/a",
    "https:///example.com/a",
    "https:////example.com/a",
    "https://?example.com/a",
    "https://#example.com/a",
    "ftp://example.com/a",
    "javascript:alert(1)",
    "https://user:password@example.com/a",
    "https://user@example.com/a",
    "https://example.com:invalid/a",
    "https://example.com/a b",
    "https://example.com/a\nb",
    "https://example.com/a\u0000b",
    "https://example.com\\@another.example/a",
    `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`,
  ]) {
    assert.throws(() => validateUrl(value), /'url' query parameter/);
  }
});

test("media URLs resolve provider-relative links and reject unsafe browser URLs", () => {
  assert.equal(resolveMediaUrl("/media/video.mp4", "https://provider.example/page"), "https://provider.example/media/video.mp4");
  assert.equal(resolveMediaUrl("//cdn.example/video.mp4", "https://provider.example/page"), "https://cdn.example/video.mp4");
  assert.equal(resolveMediaUrl("https://cdn.example/video.mp4?token=a%2Bb#part"), "https://cdn.example/video.mp4?token=a%2Bb#part");
  for (const value of [
    null, undefined, {}, "", "#download", "javascript:alert(1)", "data:text/html,test", "file:///tmp/video.mp4",
    "https:///cdn.example/video.mp4", "https:/cdn.example/video.mp4", "https://user:password@cdn.example/video.mp4",
    "https://cdn.example/a\nb", "https://cdn.example/a\u0000b", "https://cdn.example\\@other.example/video.mp4",
  ]) {
    assert.equal(resolveMediaUrl(value, "https://provider.example/page"), null, String(value));
  }
  assert.equal(resolveMediaUrl("/relative.mp4"), null);
});

const controllers = [
  ["bluesky", "handleBlueskyDownload", "fetchBlueskyMedia"],
  ["capcut", "handleCapcutDownload", "fetchCapcutData"],
  ["dailymotion", "handleDailymotionDownload", "fetchDailymotionData"],
  ["douyin", "handleDouyinDownload", "fetchDouyinVideoInfo"],
  ["facebookInsta", "handleFacebookInstaDownload", null],
  ["kuaishou", "handleKuaishouDownload", "scrapeKuaishou"],
  ["linkedin", "handleLinkedinDownload", "fetchLinkedinData"],
  ["pinterest", "handlePinterestDownload", "fetchPinterestMedia"],
  ["reddit", "handleRedditDownload", null],
  ["snapchat", "handleSnapchat", "fetchSnapchat"],
  ["soundcloud", "handleSoundcloudDownload", "fetchSoundcloudData"],
  ["spotify", "handleSpotifyDownload", "fetchSpotify"],
  ["terabox", "handleTeraboxDownload", "fetchTerabox", "Terabox"],
  ["threads", "handleThreadsDownload", null],
  ["tiktok", "handleTikTokDownload", "fetchTikTokData"],
  ["tumblr", "handleTumblrDownload", "fetchTumblrData"],
  ["twitter", "handleTwitterDownload", "twitterDownloader"],
  ["youtube", "handleYouTubeDownload", "fetchYouTubeData"],
];

function loadController(t, entry, download) {
  const [name, handlerName, serviceName, controllerName = name] = entry;
  const servicePath = require.resolve(`../services/${name}Service`);
  const controllerPath = require.resolve(`../controllers/${controllerName}Controller`);
  const originalService = require.cache[servicePath];
  const originalController = require.cache[controllerPath];
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: serviceName ? { [serviceName]: download } : download,
  };
  delete require.cache[controllerPath];
  t.after(() => {
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
    if (originalController) require.cache[controllerPath] = originalController;
    else delete require.cache[controllerPath];
  });
  return require(controllerPath)[handlerName];
}

for (const entry of controllers) {
  test(`${entry[0]} validates before calling its service and preserves successful data`, async (t) => {
    const calls = [];
    const result = { downloads: [{ url: "https://media.example/video.mp4" }] };
    const handler = loadController(t, entry, async (url) => {
      calls.push(url);
      return result;
    });

    for (const query of [{}, { url: [] }, { url: { value: "https://example.com/a" } }, { url: "invalid" }]) {
      const res = response();
      await handler({ query }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(typeof res.body.error, "string");
    }
    assert.deepEqual(calls, []);

    const res = response();
    await handler({ query: { url: " https://example.com/a?token=a%2Bb " } }, res);
    assert.deepEqual(calls, ["https://example.com/a?token=a%2Bb"]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: result });
  });
}

test("missing URLs retain the documented error message", async () => {
  const res = response();
  await createDownloadController(() => assert.fail("Service must not be called"))({ query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { success: false, error: "Missing 'url' query parameter." });
});

test("resolved provider failures and missing data do not become successful downloads", async () => {
  for (const data of [
    undefined,
    null,
    false,
    true,
    0,
    42,
    "",
    "   ",
    "<html><h1>Service unavailable</h1></html>",
    "Service unavailable",
    [],
    {},
    { success: false, error: "provider detail" },
    { status: false },
    { status: "error", message: "provider detail" },
    { status: "FAILED", message: "provider detail" },
    { error: "provider detail" },
    { error: { message: "provider detail" } },
    { success: true },
    { success: true, data: [] },
    { status: true, data: null },
    { success: true, data: { status: false } },
    { success: true, data: { error: "provider detail" } },
    { message: "No media found", code: 404 },
    { title: "Empty post", videos: [], images: [] },
    { title: "Empty post", thumbnail: "https://cdn.example/cover.jpg" },
    { url: "https://example.com/a", downloads: [] },
    { downloads: [{ url: "javascript:alert(1)" }] },
    { downloads: [{ success: false, url: "https://cdn.example/video.mp4" }] },
    [null, false, {}, "Provider unavailable"],
    "https://user:password@media.example/video.mp4",
    "https://media.example/a\u0000b",
  ]) {
    const res = response();
    await createDownloadController(async () => data)({ query: { url: "https://example.com/a" } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "Unable to fetch media from the provider. Please try again later.");
  }
});

test("cyclic provider response envelopes are rejected without overflowing", async () => {
  const data = { success: true };
  data.data = data;
  const res = response();
  await createDownloadController(async () => data)({ query: { url: "https://example.com/a" } }, res);
  assert.equal(res.statusCode, 502);
});

test("successful download URL strings retain their existing response shape", async () => {
  const res = response();
  const data = "https://media.example/video.mp4";
  await createDownloadController(async () => data)({ query: { url: "https://example.com/a" } }, res);
  assert.deepEqual(res.body, { success: true, data });
});

test("successful arrays and objects retain their existing response shape", async () => {
  for (const data of [
    [{ url: "https://media.example/video.mp4" }],
    { downloads: [{ url: "https://media.example/video.mp4" }] },
    { success: true, data: { url: "https://media.example/video.mp4" } },
    { error: null, url: "https://media.example/video.mp4" },
    { error: false, url: "https://media.example/video.mp4" },
    { success: true, data: ["https://media.example/video.mp4"] },
    { title: "Video", downloads: [{ url: "/api/files/12345678-1234-4234-8234-123456789abc" }] },
    { files: [{ fast_download_link: "https://media.example/video.mp4" }] },
    { photos: [{ variants: [{ url: "https://media.example/photo.jpg" }] }] },
    { formats: { "1080p": "https://media.example/video.mp4", original: { file: "https://media.example/original.mp4" } } },
    { downloads: { high: "https://media.example/video.mp4" } },
  ]) {
    const res = response();
    await createDownloadController(async () => data)({ query: { url: "https://example.com/a" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data });
  }
});

test("upstream errors use 502 without exposing provider credentials or response details", async () => {
  const error = new Error("GET https://provider.example?token=secret failed");
  error.cause = error;
  const res = response();
  await createDownloadController(async () => { throw error; })({ query: { url: "https://example.com/a" } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, {
    success: false,
    error: "Unable to fetch media from the provider. Please try again later.",
  });
});

test("trusted download errors retain actionable public messages and status codes", async () => {
  const { DownloadError } = require("../lib/downloadError");
  const res = response();
  await createDownloadController(async () => { throw new DownloadError("This post requires sign-in.", 422, "MEDIA_RESTRICTED"); })({ query: { url: "https://example.com/a" } }, res);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body, { success: false, error: "This post requires sign-in." });
});

test("disconnecting a client cancels extraction without sending another response", async () => {
  const { EventEmitter } = require("node:events");
  const res = Object.assign(new EventEmitter(), response());
  let signal;
  const pending = createDownloadController(async (_url, options) => {
    signal = options.signal;
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  })({ query: { url: "https://example.com/a" } }, res);
  res.emit("close");
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(res.listenerCount("close"), 0);
});

test("upstream timeouts retain 504 through wrapped error causes", async () => {
  for (const timeout of [
    Object.assign(new Error("timed out"), { code: "ECONNABORTED" }),
    Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
    Object.assign(new Error("timed out"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    Object.assign(new Error("timed out"), { name: "TimeoutError" }),
  ]) {
    const res = response();
    const error = new Error("Provider wrapper", { cause: new Error("Inner wrapper", { cause: timeout }) });
    await createDownloadController(async () => { throw error; })({ query: { url: "https://example.com/a" } }, res);
    assert.equal(res.statusCode, 504);
    assert.deepEqual(res.body, {
      success: false,
      error: "The media provider timed out. Please try again.",
    });
  }
});

test("a provider that finishes after client disconnect does not send a response", async () => {
  const { EventEmitter } = require("node:events");
  const res = Object.assign(new EventEmitter(), response());
  let complete;
  const pending = createDownloadController(() => new Promise((resolve) => { complete = resolve; }))(
    { query: { url: "https://example.com/a" } }, res);
  res.emit("close");
  complete({ url: "https://cdn.example/media.mp4" });
  await pending;
  assert.equal(res.body, undefined);
  assert.equal(res.listenerCount("close"), 0);
});
