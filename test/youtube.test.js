const assert = require("node:assert/strict");
const { test } = require("node:test");
const ytDlp = require("../lib/ytDlp");
const mediaTickets = require("../lib/mediaTickets");
const youtubeJobs = require("../lib/youtubeJobs");
const { fetchYouTubeData, canonicalizeYouTubeUrl } = require("../services/youtubeService");

const ID = "gHKT4uU8Zng";
const canonical = `https://www.youtube.com/watch?v=${ID}`;
function video(overrides = {}) {
  return { format_id: "18", ext: "mp4", protocol: "https", url: "https://r1.googlevideo.com/videoplayback?token=secret", height: 360, acodec: "mp4a.40.2", vcodec: "avc1.42001E", ...overrides };
}
function info(formats, overrides = {}) {
  return { id: ID, extractor_key: "Youtube", _type: "video", title: "Example video", duration: 5, formats, ...overrides };
}
function adaptive(overrides = {}) {
  return video({ format_id: "299", width: 1920, height: 1080, fps: 60, acodec: "none", vcodec: "avc1.64002A", filesize: 100 * 1024 ** 2, ...overrides });
}
function audio(overrides = {}) {
  return video({ format_id: "140", ext: "m4a", vcodec: "none", acodec: "mp4a.40.2", height: undefined,
    audio_channels: 2, abr: 128, language_preference: -1, filesize: 10 * 1024 ** 2, ...overrides });
}

test("YouTube canonicalizes individual video links and removes playlist/tracking parameters", () => {
  for (const url of [
    `https://youtu.be/${ID}?si=abc`, `http://www.youtube.com/watch?v=${ID}&list=PL123&t=5`,
    `https://m.youtube.com/shorts/${ID}/`, `https://youtube.com/live/${ID}`, `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`, `https://youtube.com/embed/${ID}#t=10`,
  ]) assert.equal(canonicalizeYouTubeUrl(url), canonical);
});

test("YouTube rejects non-video, deceptive, malformed and credential-bearing inputs before extraction", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => assert.fail("must not extract invalid URLs"));
  for (const url of [
    undefined, {}, `https://youtube.com.evil.test/watch?v=${ID}`, `https://notyoutube.com/watch?v=${ID}`,
    `https://user:pass@youtube.com/watch?v=${ID}`, `https://youtube.com:8080/watch?v=${ID}`,
    "https://youtube.com/playlist?list=PL123", "https://youtube.com/@channel", `https://youtu.be/${ID}/extra`,
    "https://youtube.com/watch?v=short", `https://youtube.com/watch?v=${ID}&v=${ID}`, `https://youtube.com/watch?v=${ID}%0A`,
    `https:///youtube.com/watch?v=${ID}`, `javascript:${ID}`, `https://youtube.com/redirect?q=${encodeURIComponent(canonical)}`,
  ]) {
    await assert.rejects(fetchYouTubeData(url), (error) => error.code === "INVALID_MEDIA_URL");
  }
  assert.equal(extract.mock.callCount(), 0);
});

test("YouTube preserves progressive HTTPS videos and merges headers into opaque tickets", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(ytDlp, "extractInfo", async (url, options) => {
    assert.equal(url, canonical);
    assert.equal(options.extractor, "youtube");
    assert.equal(options.signal, signal);
    return info([
      video({ height: 720, url: "https://r1.googlevideo.com/720.mp4", tbr: 800, filesize: 2097152, http_headers: { Referer: canonical, "User-Agent": "format-agent" } }),
      video({ height: 720, tbr: 500, url: "https://r1.googlevideo.com/lower-720.mp4" }),
      video(),
      video({ height: 1080, acodec: "none" }),
      video({ protocol: "m3u8_native", height: 1080 }),
      video({ url: "javascript:alert(1)" }), video({ url: "https://user:password@r1.googlevideo.com/private.mp4" }),
      video({ url: "https://evil.example/video.mp4" }),
      video({ url: "http://r1.googlevideo.com/plain.mp4" }), video({ acodec: undefined }), null,
    ], { http_headers: { "User-Agent": "base-agent", Accept: "*/*" } });
  });
  const tickets = [];
  t.mock.method(mediaTickets, "createMediaLink", (options) => {
    tickets.push(options);
    return `/api/files/ticket-${tickets.length}`;
  });
  const result = await fetchYouTubeData(`https://youtu.be/${ID}`, { signal });
  assert.equal(result.url, canonical);
  assert.equal(result.duration, 5);
  assert.deepEqual(result.videos, [
    { format: "mp4", quality: "720p", url: "/api/files/ticket-1", sizeMB: 2 },
    { format: "mp4", quality: "360p", url: "/api/files/ticket-2", sizeMB: null },
  ]);
  assert.deepEqual(result.audios, []);
  assert.deepEqual(tickets[0].headers, { "User-Agent": "format-agent", Accept: "*/*", Referer: canonical });
  assert.equal(tickets[0].filename, `Example video-${ID}-720p.mp4`);
  assert.equal(JSON.stringify(result).includes("token=secret"), false);
});

test("YouTube offers source-native 1080p and 4K with stereo AAC and exact merge-job format IDs", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => info([
    video(),
    adaptive({ format_id: "137", fps: 30 }),
    adaptive(),
    adaptive({ format_id: "303", ext: "webm", vcodec: "vp9", filesize: 80 * 1024 ** 2 }),
    adaptive({ format_id: "315", ext: "webm", vcodec: "vp9", height: 2160, width: 3840, filesize: 900 * 1024 ** 2 }),
    adaptive({ format_id: "401", vcodec: "av01.0.13M.08", height: 2160, width: 3840, filesize: 500 * 1024 ** 2 }),
    audio({ format_id: "140-drc", abr: 129 }),
    audio({ format_id: "258", audio_channels: 6, abr: 388 }),
    audio({ format_id: "380", audio_channels: 6, abr: 384, acodec: "ac-3" }),
    audio(),
  ]));
  const jobs = [];
  t.mock.method(youtubeJobs, "createYouTubeJobLink", (job) => { jobs.push(job); return `/api/files/job-${jobs.length}`; });
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/direct");
  const result = await fetchYouTubeData(canonical);
  assert.deepEqual(result.videos.map((item) => item.quality), ["2160p (4K)", "1080p", "360p"]);
  assert.deepEqual(jobs.map((job) => [job.videoFormatId, job.audioFormatId]), [["315", "140"], ["299", "140"]]);
  assert.equal(jobs[0].sourceUrl, canonical);
  assert.equal(jobs[0].videoId, ID);
  assert.equal(jobs[0].duration, 5);
  assert.equal(jobs[0].estimatedBytes, 910 * 1024 ** 2);
  assert.equal(jobs[0].filename, `Example video-${ID}-2160p.mp4`);
  assert.deepEqual(result.videos[0], {
    format: "mp4", quality: "2160p (4K)", height: 2160, width: 3840, fps: 60,
    videoCodec: "vp9", audioCodec: "mp4a.40.2", preparation: true, audioIncluded: true,
    estimated: true, url: "/api/files/job-1", sizeMB: 910,
  });
  assert.equal(JSON.stringify(jobs).includes("googlevideo.com"), false);
  assert.equal(JSON.stringify(result).includes("token=secret"), false);
});

test("YouTube adaptive selection rejects unsafe, DRM, fragmented, unmergeable, and excessive formats", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => info([
    video(), audio(),
    adaptive({ has_drm: true }),
    adaptive({ fragments: [{ url: "https://r1.googlevideo.com/segment" }] }),
    adaptive({ protocol: "m3u8_native" }),
    adaptive({ format_id: "299+140" }),
    adaptive({ format_id: "x".repeat(41) }),
    adaptive({ format_id: "-f=best;rm" }),
    adaptive({ format_id: "-299" }),
    adaptive({ url: "https://evil.example/video.mp4" }),
    adaptive({ vcodec: "unsupported" }),
    adaptive({ width: undefined }),
    adaptive({ height: 4320, width: 7680 }),
    adaptive({ height: 1080.5 }),
    adaptive({ filesize: 4 * 1024 ** 3 }),
  ]));
  const createJob = t.mock.method(youtubeJobs, "createYouTubeJobLink", () => assert.fail("invalid adaptive choice"));
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/direct");
  const result = await fetchYouTubeData(canonical);
  assert.deepEqual(result.videos.map((item) => item.quality), ["360p"]);
  assert.equal(createJob.mock.callCount(), 0);
});

test("YouTube never invents HD tiers and keeps a combined source file instead of an unnecessary merge", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => info([
    video({ height: 720 }), adaptive({ height: 720, width: 1280 }), audio(),
  ]));
  const createJob = t.mock.method(youtubeJobs, "createYouTubeJobLink", () => "/api/files/job");
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/direct");
  const ready = await fetchYouTubeData(canonical);
  assert.deepEqual(ready.videos.map((item) => item.quality), ["720p"]);
  assert.equal(createJob.mock.callCount(), 0);
  extract.mock.mockImplementation(async () => info([adaptive({ height: 720, width: 1280, filesize: undefined }), audio()]));
  const adaptiveOnly = await fetchYouTubeData(canonical);
  assert.deepEqual(adaptiveOnly.videos.map((item) => item.quality), ["720p"]);
  assert.equal(adaptiveOnly.videos[0].sizeMB, null);
  assert.equal(adaptiveOnly.videos[0].preparation, true);
  assert.equal(createJob.mock.callCount(), 1);
});

test("YouTube rejects an oversized adaptive track when its companion size is unknown", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => info([
    video(), adaptive({ filesize: 4 * 1024 ** 3 + 1 }), audio({ filesize: undefined }),
  ]));
  const createJob = t.mock.method(youtubeJobs, "createYouTubeJobLink", () => assert.fail("oversized adaptive choice"));
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/direct");
  assert.deepEqual((await fetchYouTubeData(canonical)).videos.map((item) => item.quality), ["360p"]);
  extract.mock.mockImplementation(async () => info([
    video(), adaptive({ filesize: undefined }), audio({ filesize: 4 * 1024 ** 3 + 1 }),
  ]));
  assert.deepEqual((await fetchYouTubeData(canonical)).videos.map((item) => item.quality), ["360p"]);
  assert.equal(createJob.mock.callCount(), 0);
});

test("YouTube replaces oversized direct videos with preparation and skips oversized audio", async (t) => {
  t.mock.method(ytDlp, "extractInfo", async () => info([
    video({ height: 1080, filesize: mediaTickets.MAX_DIRECT_BYTES + 1 }),
    video({ height: 720, filesize_approx: mediaTickets.MAX_DIRECT_BYTES * 2 }),
    adaptive(),
    audio({ format_id: "140-big", abr: 256, filesize: mediaTickets.MAX_DIRECT_BYTES + 1 }),
    audio({ filesize: 10 * 1024 ** 2 }),
  ]));
  const tickets = [];
  t.mock.method(mediaTickets, "createMediaLink", (ticket) => { tickets.push(ticket); return "/api/files/direct"; });
  t.mock.method(youtubeJobs, "createYouTubeJobLink", () => "/api/files/prepared");
  const result = await fetchYouTubeData(canonical);
  assert.deepEqual(result.videos.map((item) => [item.quality, !!item.preparation]), [["1080p", true], ["720p", false]]);
  assert.deepEqual(result.audios.map((item) => item.quality), ["128 kbps"]);
  assert.equal(tickets.length, 2, "size estimates alone must not suppress a direct format");
});

test("YouTube requires an MP4-compatible audio track for adaptive video and respects language preference", async (t) => {
  const extract = t.mock.method(ytDlp, "extractInfo", async () => info([adaptive(), audio({ ext: "webm", acodec: "opus" })]));
  const jobs = [];
  t.mock.method(youtubeJobs, "createYouTubeJobLink", (job) => { jobs.push(job); return "/api/files/job"; });
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/direct");
  const noAac = await fetchYouTubeData(canonical);
  assert.deepEqual(noAac.videos, []);
  assert.equal(jobs.length, 0);
  extract.mock.mockImplementation(async () => info([adaptive(), audio(), audio({ format_id: "140-original", language_preference: 10, abr: 100 })]));
  await fetchYouTubeData(canonical);
  assert.equal(jobs[0].audioFormatId, "140-original");
});

test("YouTube bounds video choices and audio choices while preserving their quality order", async (t) => {
  const formats = [144, 240, 360, 480, 720, 1080, 2160].map((height) => video({ height }));
  formats.push(
    video({ vcodec: "none", ext: "m4a", abr: 48 }),
    video({ vcodec: "none", ext: "m4a", abr: 128 }),
    video({ vcodec: "none", ext: "webm", abr: 160 }),
    video({ vcodec: "none", ext: "mp3", abr: 32 }),
  );
  t.mock.method(ytDlp, "extractInfo", async () => info(formats));
  t.mock.method(mediaTickets, "createMediaLink", () => "/api/files/opaque");
  const result = await fetchYouTubeData(canonical);
  assert.deepEqual(result.videos.map((item) => item.quality), ["2160p", "1080p", "720p", "480p", "360p"]);
  assert.deepEqual(result.audios.map((item) => [item.format, item.quality]), [["webm", "160 kbps"], ["m4a", "128 kbps"]]);
});

test("YouTube rejects playlist, live and malformed extractor results without creating tickets", async (t) => {
  const tickets = t.mock.method(mediaTickets, "createMediaLink", () => assert.fail("must not create a ticket"));
  for (const payload of [
    null, {}, info([], { entries: [] }), info([], { id: "aqz-KE-bpKQ" }), info([], { extractor_key: "Generic" }),
    info([], { _type: "playlist" }), info([video()], { is_live: true }), info([video()], { live_status: "is_upcoming" }),
    info(undefined), info([video({ acodec: "none" })]), info([video({ protocol: "m3u8_native" })]),
  ]) {
    const extract = t.mock.method(ytDlp, "extractInfo", async () => payload);
    await assert.rejects(fetchYouTubeData(canonical));
    extract.mock.restore();
  }
  assert.equal(tickets.mock.callCount(), 0);
});

test("YouTube preserves actionable extractor failures and sanitizes metadata", async (t) => {
  const error = Object.assign(new Error("YouTube needs authentication"), { code: "AUTH_REQUIRED" });
  const extract = t.mock.method(ytDlp, "extractInfo", async () => { throw error; });
  await assert.rejects(fetchYouTubeData(canonical), (actual) => actual === error);
  extract.mock.restore();
  t.mock.method(ytDlp, "extractInfo", async () => info([video({ filesize: -1, filesize_approx: Infinity })], {
    title: "Video/with:unsafe?characters", thumbnail: "javascript:alert(1)", duration: Infinity,
  }));
  t.mock.method(mediaTickets, "createMediaLink", ({ filename }) => {
    assert.equal(filename, `Video_with_unsafe_characters-${ID}-360p.mp4`);
    return "/api/files/opaque";
  });
  const result = await fetchYouTubeData(canonical);
  assert.equal(result.duration, null);
  assert.equal(result.thumbnail, null);
  assert.equal(result.videos[0].sizeMB, null);
});
