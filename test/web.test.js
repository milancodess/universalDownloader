const assert = require("node:assert/strict");
const { test } = require("node:test");
const { safeUrl, detectPlatform, extractMediaLinks, normalizeMedia } = require("../web/media");

test("platform detection matches known hosts and subdomains without accepting lookalikes", () => {
  for (const [url, platform] of [
    ["https://youtu.be/123", "youtube"],
    ["https://m.youtube.com/watch?v=123&list=456", "youtube"],
    ["https://www.instagram.com/p/123", "meta"],
    ["https://vm.tiktok.com/123", "tiktok"],
    ["https://www.threads.com/@user/post/123", "threads"],
    ["https://x.com/user/status/123", "twitter"],
  ]) assert.equal(detectPlatform(url), platform);
  for (const url of ["https://notyoutube.com/123", "https://youtube.com.evil.test", "https://youtube.com@evil.test", "javascript:alert(1)", "invalid"]) {
    assert.equal(detectPlatform(url), null, url);
  }
});

test("UI media links exclude unsafe URLs, credentials, thumbnails and the submitted page", () => {
  const source = "https://youtube.com/watch?v=test";
  const data = {
    url: source,
    thumbnail: "https://cdn.example/cover.jpg",
    profile: { url: "https://example.com/profile" },
    videos: [
      { quality: "1080p", url: "https://cdn.example/video.mp4?token=a%26b&x=1" },
      { url: "javascript:alert(1)" }, { url: "data:text/html,evil" },
      { url: "https://user:password@cdn.example/private.mp4" },
      { url: "https://cdn.exa\nmple/video.mp4" },
      { url: "https://cdn.example/video.mp4?token=a%26b&x=1" },
    ],
  };
  assert.deepEqual(extractMediaLinks(data, source), [{ url: "https://cdn.example/video.mp4?token=a%26b&x=1", label: "1080p" }]);
  assert.equal(safeUrl("https:////example.com"), null);
});

test("UI extracts direct, nested, array, and photo variant responses", () => {
  assert.equal(extractMediaLinks("https://cdn.example/video.mp4").length, 1);
  assert.equal(extractMediaLinks({ success: true, data: "https://cdn.example/video.mp4" }).length, 1);
  assert.equal(extractMediaLinks(["https://cdn.example/video.mp4"]).length, 1);
  assert.equal(extractMediaLinks({ preview: "https://cdn.example/preview.mp4", links: [] }).length, 1);
  assert.equal(extractMediaLinks({ links: [{ label: "Download HD", url: "https://cdn.example/video.mp4" }] })[0].label, "Download HD");
  const data = {
    data: {
      photos: [{ variants: [{ resolution: "1200x800", url: "https://cdn.example/photo.jpg" }] }],
      audios: [{ format: "mp3", url: "https://cdn.example/audio.mp3" }],
      downloads: [{ text: "Download HD", url: "https://cdn.example/video.mp4" }],
      images: ["https://cdn.example/photo2.jpg"],
    },
  };
  const links = extractMediaLinks(data);
  assert.equal(links.length, 4);
  assert.equal(links[0].label, "1200x800");
  assert.equal(links[1].label, "mp3");
  assert.equal(links[2].label, "Download HD");
});

test("UI result traversal is bounded for large or cyclic provider objects", () => {
  const cyclic = {};
  cyclic.data = cyclic;
  assert.deepEqual(extractMediaLinks(cyclic), []);
  const links = extractMediaLinks({ downloads: Array.from({ length: 500 }, (_, i) => ({ url: `https://cdn.example/${i}.mp4` })) });
  assert.equal(links.length, 100);
});

test("UI accepts only opaque app download routes as relative media links", () => {
  const local = "/api/files/05a289b6-b591-4a8d-b683-79d56cba6167";
  const data = { downloads: [
    { url: local, quality: "360p" },
    { url: "/api/files/../../secret" }, { url: "//evil.example/file.mp4" },
    { url: `${local}?url=https://evil.example` }, { url: "/other/file.mp4" },
  ] };
  assert.deepEqual(extractMediaLinks(data), [{ url: local, label: "360p" }]);
  assert.deepEqual(extractMediaLinks({ url: "https://www.youtube.com/watch?v=gHKT4uU8Zng", videos: [{ url: local, quality: "360p" }] }, "https://youtu.be/gHKT4uU8Zng"), [{ url: local, label: "360p" }]);
});

test("UI normalization separates YouTube video and audio and retains known metadata", () => {
  const video = "/api/files/05a289b6-b591-4a8d-b683-79d56cba6167";
  const audio = "/api/files/85a289b6-b591-4a8d-b683-79d56cba6167";
  const normalized = normalizeMedia({
    type: "video", title: "A real video", duration: 635, thumbnail: "https://cdn.example/cover.jpg",
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    videos: [{ format: "mp4", quality: "360p", sizeMB: 27.2, url: video }],
    audios: [{ format: "webm", quality: "129 kbps", sizeMB: null, url: audio }],
  }, "https://youtu.be/aqz-KE-bpKQ");
  assert.equal(normalized.title, "A real video");
  assert.equal(normalized.duration, 635);
  assert.equal(normalized.thumbnail, "https://cdn.example/cover.jpg");
  assert.equal(normalized.platform, "youtube");
  assert.deepEqual(normalized.items.map(({ kind, format, quality, sizeBytes, local }) => ({ kind, format, quality, sizeBytes, local })), [
    { kind: "video", format: "mp4", quality: "360p", sizeBytes: Math.round(27.2 * 1024 ** 2), local: true },
    { kind: "audio", format: "webm", quality: "129 kbps", sizeBytes: null, local: true },
  ]);
});

test("UI normalization supports Instagram mixed carousels with opaque routes", () => {
  const normalized = normalizeMedia({ title: "Mixed post", data: [
    { type: "photo", filename: "instagram-photo.jpg", quality: "Image", url: "/api/files/05a289b6-b591-4a8d-b683-79d56cba6167", thumbnail: "https://cdn.example/photo.jpg" },
    { type: "video", filename: "instagram-video.mp4", quality: "720p", url: "/api/files/85a289b6-b591-4a8d-b683-79d56cba6167" },
  ] }, "https://www.instagram.com/p/Example123/");
  assert.equal(normalized.platform, "meta");
  assert.equal(normalized.thumbnail, "https://cdn.example/photo.jpg");
  assert.equal(normalized.duration, null);
  assert.deepEqual(normalized.items.map(({ kind, format }) => [kind, format]), [["photo", "jpg"], ["video", "mp4"]]);
});

test("UI normalization rejects unsafe previews and files and leaves absent facts empty", () => {
  const normalized = normalizeMedia({
    title: 42, duration: Infinity, thumbnail: "https://user:password@cdn.example/cover.jpg",
    downloads: [
      { url: "javascript:alert(1)" },
      { url: "//cdn.example/video.mp4" },
      { url: "/api/files/../../secret" },
      { url: "https://cdn.example/file", thumbnail: "data:image/svg+xml,evil", sizeMB: -4, quality: null },
    ],
  });
  assert.equal(normalized.title, "");
  assert.equal(normalized.thumbnail, null);
  assert.equal(normalized.duration, null);
  assert.equal(normalized.platform, null);
  assert.deepEqual(normalized.items, [{ url: "https://cdn.example/file", label: "Media 1", kind: "file", format: "", quality: "", sizeBytes: null, local: false }]);
});

test("UI normalization uses explicit size units and nested collection context", () => {
  const normalized = normalizeMedia({ data: { photos: [{ variants: [
    { url: "https://cdn.example/one", resolution: "1200x800", size: "1.5 MB" },
    { url: "https://cdn.example/two", size: "1.5 MiB" },
  ] }], audios: [{ url: "https://cdn.example/three.m4a", sizeBytes: 1024 }], downloads: [
    { url: "https://cdn.example/four.mp3", size: "unknown" },
    { url: "https://cdn.example/five.mp4", sizeMB: Number.MAX_VALUE },
  ] } });
  assert.deepEqual(normalized.items.map(({ kind, sizeBytes }) => [kind, sizeBytes]), [
    ["photo", 1500000], ["photo", 1572864], ["audio", 1024], ["audio", null], ["video", null],
  ]);
  const cyclic = {};
  cyclic.data = cyclic;
  assert.deepEqual(normalizeMedia(cyclic).items, []);
});

test("UI preserves validated HD preparation metadata without exposing remote job actions", () => {
  const route = "/api/files/05a289b6-b591-4a8d-b683-79d56cba6167";
  const [hd, remote, invalid] = normalizeMedia({ videos: [
    { url: route, format: "mp4", quality: "2160p (4K)", preparation: true, estimated: true, sizeMB: 900, width: 3840, height: 2160, fps: 59.94, videoCodec: "vp9", audioCodec: "mp4a.40.2" },
    { url: "https://cdn.example/video.mp4", preparation: true, estimated: "true", width: "3840", height: -1080, fps: Infinity, videoCodec: "<script>", audioCodec: "a".repeat(65) },
    { url: "/api/files/85a289b6-b591-4a8d-b683-79d56cba6167", preparation: "true", width: 1.5, height: 32769, fps: 0 },
  ] }).items;
  assert.equal(hd.preparation, true);
  assert.equal(hd.estimated, true);
  assert.equal(hd.sizeBytes, 900 * 1024 ** 2);
  assert.deepEqual([hd.width, hd.height, hd.fps, hd.videoCodec, hd.audioCodec], [3840, 2160, 59.94, "vp9", "mp4a.40.2"]);
  for (const item of [remote, invalid]) {
    for (const key of ["preparation", "estimated", "width", "height", "fps", "videoCodec", "audioCodec"]) assert.equal(item[key], undefined, key);
  }
});
