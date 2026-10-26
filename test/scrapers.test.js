const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("../lib/httpClient");
const { fetchBlueskyMedia } = require("../services/blueskyService");
const { fetchDouyinVideoInfo } = require("../services/douyinService");
const { fetchPinterestMedia } = require("../services/pinterestService");
const redditDownloader = require("../services/redditService");
const threadsDownloader = require("../services/threadsService");
const { fetchTikTokData } = require("../services/tiktokService");
const { twitterDownloader } = require("../services/twitterService");

function respond(t, method, data) {
  return t.mock.method(http, method, async () => ({ data }));
}

test("Pinterest extracts the nested URL once and excludes wrapper parameters", async (t) => {
  const target = "https://cdn.example/video.mp4?token=a%2Fb&expires=123";
  respond(t, "get", `<table><tbody>
    <tr><td class="video-quality">720p</td><td>MP4</td>
      <td><a href="/fetch.php?url=${encodeURIComponent(target)}&amp;download=1">Download</a></td></tr>
    <tr><td class="video-quality">bad</td><td>MP4</td><td><a href="/fetch.php?url=%E0%A4%A">Bad</a></td></tr>
    <tr><td class="video-quality">bad</td><td>MP4</td><td><a href="/fetch.php?url=">Bad</a></td></tr>
    <tr><td class="video-quality">bad</td><td>MP4</td><td><a href="#">Bad</a></td></tr>
  </tbody></table>`);

  const result = await fetchPinterestMedia("https://pinterest.com/pin/123/");
  assert.deepEqual(result.downloads, [{ quality: "720p", format: "MP4", url: target }]);
});

test("Pinterest accepts a direct media URL", async (t) => {
  respond(t, "get", `<table><tbody><tr><td class="video-quality">Original</td><td>JPG</td>
    <td><a href="https://cdn.example/image.jpg">Download</a></td></tr></tbody></table>`);
  const result = await fetchPinterestMedia("https://pinterest.com/pin/123/");
  assert.equal(result.downloads[0].url, "https://cdn.example/image.jpg");
});

test("Threads ignores malformed resolutions and empty photos, preserving sorted variants", async (t) => {
  respond(t, "post", { status: "ok", data: `<ul class="download-box">
    <li><span class="icon-dlimage"></span><select class="photo-option">
      <option value="https://cdn.example/bad.jpg">original x size</option>
      <option value="https://cdn.example/zero.jpg">0x100</option>
      <option value="https://cdn.example/small.jpg">320x240</option>
      <option value="https://cdn.example/large.jpg">1920 × 1080</option>
    </select></li>
    <li><span class="icon-dlimage"></span><select class="photo-option">
      <option value="#">100x100</option>
    </select></li>
  </ul>` });
  const result = await threadsDownloader("https://threads.net/@user/post/123");
  assert.equal(result.photoCount, 1);
  assert.equal(result.photos[0].index, 1);
  assert.deepEqual(result.photos[0].variants.map(({ width, height }) => [width, height]), [
    [1920, 1080], [320, 240],
  ]);
});

test("TikTok returns a thumbnail URL instead of a CSS declaration and keeps slides", async (t) => {
  respond(t, "post", `<div id="mainpicture" style="background-image: url('https://cdn.example/cover.jpg')"></div>
    <a class="download_link" href="https://cdn.example/video.mp4"> Download  video </a>
    <a class="download_link slide" href="https://cdn.example/slide.jpg">Photo</a>
    <a class="download_link" href="#modal">Placeholder</a>`);
  const result = await fetchTikTokData("https://tiktok.com/@user/video/123");
  assert.equal(result.thumbnail, "https://cdn.example/cover.jpg");
  assert.deepEqual(result.downloads, [
    { text: "Download video", url: "https://cdn.example/video.mp4" },
    { url: "https://cdn.example/slide.jpg" },
  ]);
});

test("Bluesky reads videos using an HTML source child", async (t) => {
  respond(t, "get", `<section class="download_result_section"><div class="download_item">
    <div class="image_wrapper"><img src="https://cdn.example/preview.jpg"></div>
    <div class="video_wrapper"><video poster="https://cdn.example/poster.jpg">
      <source src="https://cdn.example/video.mp4" type="video/mp4">
    </video></div></div></section>`);
  const result = await fetchBlueskyMedia("https://bsky.app/profile/user/post/123");
  assert.equal(result.videoCount, 1);
  assert.equal(result.videos[0].url, "https://cdn.example/video.mp4");
});

test("Reddit resolves relative download links", async (t) => {
  respond(t, "get", '<a class="downloadbutton" href="/download/video.mp4">Download</a>');
  assert.equal(await redditDownloader("https://reddit.com/r/test/comments/123/"),
    "https://rapidsave.com/download/video.mp4");
});

test("Reddit rejects placeholder or executable download links", async (t) => {
  for (const href of ["#", "javascript:alert(1)"]) {
    const mock = respond(t, "get", `<a class="downloadbutton" href="${href}">Download</a>`);
    await assert.rejects(redditDownloader("https://reddit.com/r/test/comments/123/"), /Download link not found/);
    mock.mock.restore();
  }
});

test("Twitter keeps highest quality first and supports photo-only posts", async (t) => {
  const mock = respond(t, "post", { status: "ok", data: `
    <a class="tw-button-dl" href="https://dl.snapcdn.app/low">MP4 (360p)</a>
    <a class="tw-button-dl" href="https://dl.snapcdn.app/high">MP4 (1080p)</a>` });
  const video = await twitterDownloader("https://x.com/user/status/123");
  assert.deepEqual(video.videos.map(({ quality }) => quality), ["1080p", "360p"]);
  mock.mock.restore();
  respond(t, "post", { status: "ok", data: '<div class="photo-list"><img src="https://cdn.example/photo.jpg"></div>' });
  const photo = await twitterDownloader("https://x.com/user/status/456");
  assert.equal(photo.type, "photo");
  assert.equal(photo.images.length, 1);
});

test("Douyin retains downloadable links while excluding profile actions", async (t) => {
  respond(t, "post", { status: "ok", data: `<div class="tik-right"><div class="dl-action">
    <a class="tik-button-dl" href="https://cdn.example/video.mp4">Download MP4</a>
    <a class="tik-button-dl" href="https://douyin.com/user/123">Profile</a>
    <a class="tik-button-dl" href="#">Placeholder</a>
  </div></div>` });
  const result = await fetchDouyinVideoInfo("https://douyin.com/video/123");
  assert.deepEqual(result.links, [{ label: "Download MP4", url: "https://cdn.example/video.mp4" }]);
});

const scrapers = [
  { name: "Bluesky", run: fetchBlueskyMedia, method: "get", wrap: (html) => html },
  { name: "Douyin", run: fetchDouyinVideoInfo, method: "post", wrap: (html) => ({ status: "ok", data: html }) },
  { name: "Pinterest", run: fetchPinterestMedia, method: "get", wrap: (html) => html },
  { name: "Reddit", run: redditDownloader, method: "get", wrap: (html) => html },
  { name: "Threads", run: threadsDownloader, method: "post", wrap: (html) => ({ status: "ok", data: html }) },
  { name: "TikTok", run: fetchTikTokData, method: "post", wrap: (html) => html },
  { name: "Twitter", run: twitterDownloader, method: "post", wrap: (html) => ({ status: "ok", data: html }) },
];

for (const scraper of scrapers) {
  test(`${scraper.name} rejects an upstream error page instead of reporting empty success`, async (t) => {
    t.mock.method(console, "error", () => {});
    respond(t, scraper.method, scraper.wrap("<html><h1>Service unavailable</h1></html>"));
    await assert.rejects(scraper.run("https://example.com/post/123"), /No media found|Download link not found/);
  });

  test(`${scraper.name} rejects a malformed upstream response`, async (t) => {
    t.mock.method(console, "error", () => {});
    respond(t, scraper.method, null);
    await assert.rejects(scraper.run("https://example.com/post/123"), /Invalid response|invalid response|Failed to fetch/);
  });

  test(`${scraper.name} preserves transport errors for HTTP error classification`, async (t) => {
    t.mock.method(console, "error", () => {});
    const timeout = Object.assign(new Error("request timeout"), { code: "ECONNABORTED" });
    t.mock.method(http, scraper.method, async () => { throw timeout; });
    await assert.rejects(scraper.run("https://example.com/post/123"), (error) =>
      error === timeout || error.cause === timeout);
  });
}
