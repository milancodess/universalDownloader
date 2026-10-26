const assert = require("node:assert/strict");
const test = require("node:test");
const { createDownloadController } = require("../lib/downloadController");
const { validateUrl, MAX_URL_LENGTH } = require("../lib/validateUrl");

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
  ]) {
    const res = response();
    await createDownloadController(async () => data)({ query: { url: "https://example.com/a" } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "Unable to fetch media from the provider. Please try again later.");
  }
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
