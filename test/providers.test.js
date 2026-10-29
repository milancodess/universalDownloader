const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("../lib/httpClient");

const { fetchDailymotionData } = require("../services/dailymotionService");
const { fetchTerabox } = require("../services/teraboxService");
const { configureMetaHttp } = require("../services/configureMetaHttp");

test("Dailymotion preserves its successful response shape", async (t) => {
  const payload = { title: "Example", url: "https://cdn.example/video.mp4" };
  t.mock.method(http, "get", async () => ({ data: payload }));
  assert.deepEqual(await fetchDailymotionData("https://dai.ly/example"), {
    success: true,
    data: payload,
  });
});

test("Dailymotion rejects HTTP failures instead of resolving an error payload", async (t) => {
  const upstreamError = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
  t.mock.method(http, "get", async () => { throw upstreamError; });
  await assert.rejects(fetchDailymotionData("https://dai.ly/example"), (error) => {
    assert.equal(error.cause, upstreamError);
    return true;
  });
});

test("Dailymotion rejects failed or malformed upstream payloads before wrapping", async (t) => {
  for (const data of [null, { success: false }, { status: false }, "<html>Provider error</html>", "", true, 0, {}, []]) {
    const request = t.mock.method(http, "get", async () => ({ data }));
    await assert.rejects(fetchDailymotionData("https://dai.ly/example"), /Dailymotion request failed/);
    request.mock.restore();
  }
});

test("Terabox accepts formatted JSON nonce fields and encodes request parameters", async (t) => {
  t.mock.method(http, "get", async () => ({
    data: '<script id="jquery-core-js-extra">var config = { "nonce" : "abc123" };</script>',
  }));
  const url = "https://terabox.com/s/example?pwd=a&other=b";
  t.mock.method(http, "post", async (endpoint, body) => {
    assert.equal(endpoint, "https://teradownloaderz.com/wp-admin/admin-ajax.php");
    const fields = new URLSearchParams(body);
    assert.equal(fields.get("url"), url);
    assert.equal(fields.get("nonce"), "abc123");
    assert.equal(fields.get("action"), "terabox_fetch");
    return { data: { success: true, data: ["example"] } };
  });
  assert.deepEqual(await fetchTerabox(url), { success: true, data: ["example"] });
});

test("Terabox does not submit a download when the nonce is missing", async (t) => {
  t.mock.method(http, "get", async () => ({ data: "<html>Provider error</html>" }));
  const post = t.mock.method(http, "post", async () => assert.fail("download must not be submitted"));
  await assert.rejects(fetchTerabox("https://terabox.com/s/example"), (error) => {
    assert.match(error.cause.message, /Nonce script not found/);
    return true;
  });
  assert.equal(post.mock.callCount(), 0);
});

const wrappedPostServices = [
  ["Capcut", require("../services/capcutService").fetchCapcutData],
  ["Kuaishou", require("../services/kuaishouService").scrapeKuaishou],
  ["LinkedIn", require("../services/linkedinService").fetchLinkedinData],
  ["Snapchat", require("../services/snapchatService").fetchSnapchat],
  ["SoundCloud", require("../services/soundcloudService").fetchSoundcloudData],
  ["Spotify", require("../services/spotifyService").fetchSpotify],
  ["Tumblr", require("../services/tumblrService").fetchTumblrData],
];

for (const [name, download] of wrappedPostServices) {
  test(`${name} preserves the transport error for timeout classification`, async (t) => {
    const upstreamError = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
    t.mock.method(http, "post", async () => { throw upstreamError; });
    await assert.rejects(download("https://example.com/media"), (error) => {
      assert.equal(error.cause, upstreamError);
      return true;
    });
  });
}

test("Terabox preserves timeouts while fetching its nonce", async (t) => {
  const upstreamError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  t.mock.method(http, "get", async () => { throw upstreamError; });
  await assert.rejects(fetchTerabox("https://terabox.com/s/example"), (error) => {
    assert.equal(error.cause, upstreamError);
    return true;
  });
});

function loadMetaService(t, download) {
  const dependencyPath = require.resolve("../lib/runWorker");
  const servicePath = require.resolve("../services/facebookInstaService");
  const originalDependency = require.cache[dependencyPath];
  const originalService = require.cache[servicePath];
  require.cache[dependencyPath] = {
    id: dependencyPath,
    filename: dependencyPath,
    loaded: true,
    exports: { runWorker: async (filename, url, options) => {
      assert.equal(require("node:path").basename(filename), "facebookInstaWorker.js");
      return download(url, options);
    } },
  };
  delete require.cache[servicePath];
  t.after(() => {
    if (originalDependency) require.cache[dependencyPath] = originalDependency;
    else delete require.cache[dependencyPath];
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
  });
  return require(servicePath);
}

test("Meta forwards the URL and preserves successful dependency payloads", async (t) => {
  const url = "https://www.facebook.com/reel/123456789/";
  const payload = {
    status: true,
    data: [{ thumbnail: "https://cdn.example/thumbnail.jpg", url: "https://cdn.example/video.mp4" }],
  };
  const download = loadMetaService(t, async (value) => {
    assert.equal(value, url);
    return payload;
  });
  assert.equal(await download(url), payload);
});

test("Meta preserves dependency failure markers for the controller", async (t) => {
  const payload = { status: false, msg: "Provider could not find media" };
  const download = loadMetaService(t, async () => payload);
  assert.equal(await download("https://www.facebook.com/reel/123456789/"), payload);
});

test("Meta forwards request cancellation to the isolated worker", async (t) => {
  const controller = new AbortController();
  const download = loadMetaService(t, async (url, options) => {
    assert.equal(options.signal, controller.signal);
    return { status: true, data: [{ url: "https://cdn.example/video.mp4" }] };
  });
  await download("https://www.facebook.com/reel/123456789/", { signal: controller.signal });
});

test("Meta preserves rejected dependency errors as the cause", async (t) => {
  const upstreamError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  const download = loadMetaService(t, async () => { throw upstreamError; });
  await assert.rejects(download("https://www.facebook.com/reel/123456789/"), (error) => {
    assert.equal(error.message, "Error fetching Meta media");
    assert.equal(error.cause, upstreamError);
    return true;
  });
});

test("Meta worker HTTP setup preserves complete URLs in the dependency's form field", async () => {
  const url = "https://www.instagram.com/reel/example/?next=x%26y&caption=a+b#fragment";
  const client = require("axios").create({
    adapter: async (config) => {
      const fields = new URLSearchParams(config.data);
      assert.deepEqual([...fields], [["url", url]]);
      return { status: 200, data: "ok", config, headers: {} };
    },
  });
  configureMetaHttp(client, url);
  await client.post("https://provider.example/download", `url=${url}`);
  for (const key of ["timeout", "maxContentLength", "maxBodyLength", "maxRedirects"]) {
    assert.equal(client.defaults[key], http.defaults[key]);
  }
});

test("Meta worker HTTP setup leaves unrelated request bodies unchanged", async () => {
  const client = require("axios").create({
    adapter: async (config) => ({ status: 200, data: config.data, config, headers: {} }),
  });
  configureMetaHttp(client, "https://www.instagram.com/reel/example/");
  const response = await client.post("https://provider.example/download", "other=value&url=another");
  assert.equal(response.data, "other=value&url=another");
});
