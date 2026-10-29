const assert = require("node:assert/strict");
const { test } = require("node:test");
const ytDlp = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const { fetchInstagramData, canonicalInstagramUrl } = require("../services/instagramService");

const sourceUrl = "https://www.instagram.com/reel/Example123/";
const mediaUrl = "https://scontent.example.cdninstagram.com/video.mp4";

test("Instagram canonicalizes post and reel links while rejecting other destinations", () => {
  for (const url of [sourceUrl, "https://instagram.com/p/Example123/?igsh=tracking", "http://m.instagram.com/reels/Example123/#share", "https://www.instagram.com/creator.name/tv/Example123/"]) {
    assert.equal(canonicalInstagramUrl(url), "https://www.instagram.com/p/Example123/");
  }
  for (const url of ["https://instagram.com.evil.test/p/Example123/", "https://evil.test/", "https://user:pass@instagram.com/p/Example123/", "https://instagram.com:8080/p/Example123/", "https://www.instagram.com/profile/", "https://www.instagram.com/stories/creator/123/", "https://www.instagram.com/p/Example\n123/", "not a url"]) {
    assert.throws(() => canonicalInstagramUrl(url), { code: "INVALID_INSTAGRAM_URL" });
  }
});

test("Instagram prefers a complete video and registers an opaque local download link", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(ytDlp, "extractInfo", async (url, options) => {
    assert.equal(url, "https://www.instagram.com/p/Example123/");
    assert.equal(options.extractor, "Instagram");
    assert.equal(options.signal, signal);
    return { id: "Example123", title: "Example reel", thumbnail: "https://cdn.example/thumb.jpg", http_headers: { Referer: "https://www.instagram.com/" }, formats: [
      { format_id: "silent", ext: "mp4", height: 1080, vcodec: "h264", acodec: "none", url: `${mediaUrl}?silent` },
      { format_id: "complete", ext: "mp4", height: 720, vcodec: "h264", acodec: "aac", url: mediaUrl, http_headers: { "User-Agent": "example" } },
    ] };
  });
  const register = t.mock.method(mediaTickets, "createMediaLink", (ticket) => {
    assert.equal(ticket.url, mediaUrl);
    assert.equal(ticket.filename, "instagram-Example123.mp4");
    assert.deepEqual(ticket.headers, { Referer: "https://www.instagram.com/", "User-Agent": "example" });
    return "/api/files/opaque-id";
  });
  const result = await fetchInstagramData(sourceUrl, { signal });
  assert.equal(result.status, true);
  assert.equal(result.title, "Example reel");
  assert.equal(result.data[0].url, "/api/files/opaque-id");
  assert.equal(result.data[0].quality, "720p");
  assert.equal(register.mock.callCount(), 1);
});

test("Instagram preserves carousel videos while skipping invalid, image, manifest, and DRM entries", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => ({ title: "Carousel", entries: [null,
    { id: "photo", thumbnail: "https://cdn.example/image.jpg" },
    { id: "first", formats: [
      { ext: "mp4", vcodec: "h264", url: "javascript:alert(1)" },
      { ext: "mp4", vcodec: "h264", url: "https://user:password@cdn.example/video.mp4" },
      { ext: "mp4", vcodec: "h264", url: "https://cdn.example/master.m3u8", protocol: "m3u8_native" },
      { ext: "mp4", vcodec: "h264", url: mediaUrl, has_drm: true },
      { ext: "mp4", height: 480, vcodec: "h264", acodec: "none", url: `${mediaUrl}?first` },
    ] },
    { id: "second", formats: [{ ext: "mp4", height: 720, vcodec: "h264", acodec: "none", url: `${mediaUrl}?second` }] },
  ] }));
  const register = t.mock.method(mediaTickets, "createMediaLink", ({ filename }) => `/api/files/${filename}`);
  const result = await fetchInstagramData(sourceUrl);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map((item) => item.filename), ["instagram-first.mp4", "instagram-second.mp4"]);
  assert.equal(register.mock.callCount(), 2);
});

test("Instagram exposes separate audio instead of mislabeling a video-only stream", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => ({ id: "split", formats: [
    { ext: "mp4", height: 1080, vcodec: "h264", acodec: "none", url: mediaUrl },
    { ext: "m4a", vcodec: "none", acodec: "aac", abr: 128, url: "https://scontent.example.cdninstagram.com/audio.m4a" },
  ] }));
  t.mock.method(mediaTickets, "createMediaLink", ({ filename }) => `/api/files/${filename}`);
  const result = await fetchInstagramData(sourceUrl);
  assert.deepEqual(result.data.map((item) => [item.type, item.quality]), [["video", "1080p (video only)"], ["audio", "Audio only"]]);
});

test("Instagram supports public photo candidates without treating a blocked video's poster as a photo", async (t) => {
  const imageUrl = "https://scontent.example.cdninstagram.com/photo.jpg";
  t.mock.method(ytDlp, "extractInfo", async () => ({ title: "Mixed post", entries: [
    { id: "photo", formats: [], thumbnail: imageUrl, thumbnails: [{ url: `${imageUrl}?small` }], _has_drm: null },
    { id: "video", formats: [], thumbnail: imageUrl, duration: 3.5 },
    { id: "drm", formats: [], thumbnail: imageUrl, _has_drm: true },
    { id: "explicit-video", formats: [], thumbnail: imageUrl, is_video: true },
    { id: "bad", formats: [], thumbnail: "javascript:alert(1)" },
  ] }));
  const register = t.mock.method(mediaTickets, "createMediaLink", (ticket) => {
    assert.equal(ticket.url, imageUrl);
    assert.equal(ticket.filename, "instagram-photo.jpg");
    return "/api/files/photo-id";
  });
  const result = await fetchInstagramData(sourceUrl);
  assert.equal(register.mock.callCount(), 1);
  assert.deepEqual(result.data.map((item) => [item.type, item.quality]), [["photo", "Image"]]);
});

test("Instagram limits media registrations and rejects empty or malformed results", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => ({ entries: Array.from({ length: 30 }, (_, i) => ({ id: `item${i}`, formats: [{ ext: "mp4", url: mediaUrl }] })) }));
  const register = t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/id");
  assert.equal((await fetchInstagramData(sourceUrl)).data.length, 20);
  assert.equal(register.mock.callCount(), 20);
  extract.mock.mockImplementation(async () => ({ entries: [{ id: "photo", formats: [] }] }));
  await assert.rejects(fetchInstagramData(sourceUrl), { code: "INSTAGRAM_NO_MEDIA" });
  extract.mock.mockImplementation(async () => null);
  await assert.rejects(fetchInstagramData(sourceUrl), { code: "INSTAGRAM_UNAVAILABLE" });
});

test("Instagram keeps actionable extractor failures unchanged", async (t) => {
  const failure = Object.assign(new Error("Instagram requires login for this post."), { code: "LOGIN_REQUIRED" });
  t.mock.method(ytDlp, "extractInfo", async () => { throw failure; });
  await assert.rejects(fetchInstagramData(sourceUrl), (error) => error === failure);
});

test("Instagram skips unsupported CDN formats and labels silent video even without a separate audio track", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => ({ entries: [
    { id: "video", formats: [
      { ext: "mp4", height: 1080, vcodec: "h264", acodec: "aac", url: "https://unsupported.example/video.mp4" },
      { ext: "mp4", height: 720, vcodec: "h264", acodec: "none", url: mediaUrl },
    ] },
    { id: "photo", formats: [], thumbnail: "https://unsupported.example/photo.jpg", thumbnails: [
      { url: "https://scontent.example.cdninstagram.com/photo.jpg" },
    ] },
  ] }));
  t.mock.method(mediaTickets, "createMediaLink", ({ url }) => {
    assert.match(url, /^https:\/\/scontent\.example\.cdninstagram\.com\//);
    return "/api/files/safe";
  });
  const result = await fetchInstagramData(sourceUrl);
  assert.deepEqual(result.data.map((item) => item.quality), ["720p (video only)", "Image"]);
});

test("Instagram chooses direct formats within the transfer limit without treating estimates as actual sizes", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => ({ id: "split", formats: [
    { ext: "mp4", height: 1080, vcodec: "h264", acodec: "aac", filesize: mediaTickets.MAX_DIRECT_BYTES + 1, url: `${mediaUrl}?oversized` },
    { ext: "mp4", height: 720, vcodec: "h264", acodec: "none", filesize_approx: mediaTickets.MAX_DIRECT_BYTES * 2, url: mediaUrl },
    { ext: "m4a", vcodec: "none", acodec: "aac", abr: 256, filesize: mediaTickets.MAX_DIRECT_BYTES + 1, url: `${mediaUrl}?big-audio` },
    { ext: "m4a", vcodec: "none", acodec: "aac", abr: 128, filesize: mediaTickets.MAX_DIRECT_BYTES, url: `${mediaUrl}?audio` },
  ] }));
  const tickets = [];
  t.mock.method(mediaTickets, "createMediaLink", (ticket) => { tickets.push(ticket); return "/api/files/safe"; });
  const result = await fetchInstagramData(sourceUrl);
  assert.deepEqual(result.data.map((item) => item.quality), ["720p (video only)", "Audio only"]);
  assert.deepEqual(tickets.map((ticket) => ticket.url), [mediaUrl, `${mediaUrl}?audio`]);
});
