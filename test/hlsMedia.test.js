const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Readable, PassThrough } = require("node:stream");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { createHlsMediaStream, parseHlsManifest } = require("../lib/hlsMedia");

const BASE = "https://cf-hls-media.sndcdn.com/audio/playlist.m3u8?signature=private";
const INIT_URL = "https://cf-hls-media.sndcdn.com/audio/init.mp4";
const SEGMENT_URLS = [1, 2].map((index) => `https://cf-hls-media.sndcdn.com/audio/segment${index}.m4s`);
const MIB = 1024 * 1024;
function box(type, content = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + content.length);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}
const INIT = Buffer.concat([box("ftyp", Buffer.from("iso6\0\0\0\0iso6mp41")), box("moov")]);
const SEGMENTS = [1, 2].map((value) => Buffer.concat([box("moof"), box("mdat", Buffer.alloc(64, value))]));
const PLAYLIST = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-PLAYLIST-TYPE:VOD", '#EXT-X-MAP:URI="init.mp4"',
  "#EXTINF:4.0,", "segment1.m4s", "#EXTINF:3.0,", "segment2.m4s", "#EXT-X-ENDLIST"].join("\n");

function fixture(overrides = {}) {
  const resources = new Map([[BASE, PLAYLIST], [INIT_URL, INIT], ...SEGMENT_URLS.map((url, index) => [url, SEGMENTS[index]])]);
  for (const [url, value] of Object.entries(overrides)) resources.set(url, value);
  const calls = [];
  const streams = [];
  const request = async (url, limit, validate) => {
    assert.equal(typeof validate, "function");
    assert.equal(validate(url), url);
    calls.push({ url, limit });
    assert.ok(resources.has(url), `Unexpected resource: ${url}`);
    const value = resources.get(url);
    if (value instanceof Error) throw value;
    const data = value instanceof Readable ? value : Readable.from([Buffer.from(value)]);
    streams.push(data);
    return { data, status: 200, headers: {}, url };
  };
  return { request, calls, streams };
}

async function collect(stream) {
  const parts = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}

test("HLS parses a complete relative fMP4 playlist and assembles exact audio bytes in order", async () => {
  assert.deepEqual(parseHlsManifest(PLAYLIST, BASE), { initialization: INIT_URL, segments: SEGMENT_URLS });
  const { request, calls, streams } = fixture();
  const expected = Buffer.concat([INIT, ...SEGMENTS]);
  const result = await collect(await createHlsMediaStream(BASE, request, { maxBytes: expected.length }));
  assert.deepEqual(result, expected);
  assert.deepEqual(calls.map(({ url }) => url), [BASE, INIT_URL, ...SEGMENT_URLS]);
  assert.equal(calls[0].limit, MIB);
  assert.equal(calls[1].limit, expected.length);
  assert.equal(calls[2].limit, expected.length - INIT.length);
  assert.equal(calls[3].limit, SEGMENTS[1].length);
  assert.ok(streams.every((stream) => stream.destroyed));
});

test("HLS resolves segment paths against the validated final manifest URL after redirects", async () => {
  const finalUrl = "https://playback.media-streaming.soundcloud.cloud/redirected/audio/playlist.m3u8";
  const requested = [];
  const request = async (url, limit, validate) => {
    assert.equal(validate(url), url);
    requested.push(url);
    const value = requested.length === 1 ? PLAYLIST : requested.length === 2 ? INIT : SEGMENTS[requested.length - 3];
    return { data: Readable.from([value]), headers: {}, status: 200, url: requested.length === 1 ? finalUrl : url };
  };
  assert.deepEqual(await collect(await createHlsMediaStream(BASE, request)), Buffer.concat([INIT, ...SEGMENTS]));
  assert.deepEqual(requested.slice(1), ["init.mp4", "segment1.m4s", "segment2.m4s"].map((path) => new URL(path, finalUrl).href));
});

test("HLS rejects live, encrypted, master, ranged and discontinuous playlists", () => {
  const invalid = [
    PLAYLIST.replace("\n#EXT-X-ENDLIST", ""),
    PLAYLIST.replace("PLAYLIST-TYPE:VOD", "PLAYLIST-TYPE:EVENT"),
    PLAYLIST.replace("#EXTINF:4.0,", '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4.0,'),
    PLAYLIST.replace("#EXTINF:4.0,", '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4.0,'),
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=96000\nchild.m3u8\n#EXT-X-ENDLIST',
    PLAYLIST.replace("#EXTINF:4.0,", "#EXT-X-BYTERANGE:100@0\n#EXTINF:4.0,"),
    PLAYLIST.replace("#EXTINF:3.0,", "#EXT-X-DISCONTINUITY\n#EXTINF:3.0,"),
    PLAYLIST.replace('URI="init.mp4"', 'URI="init.mp4",BYTERANGE="100@0"'),
    PLAYLIST.replace("#EXTINF:4.0,", "#EXT-X-GAP\n#EXTINF:4.0,"),
  ];
  for (const text of invalid) assert.throws(() => parseHlsManifest(text, BASE));
});

test("HLS rejects malformed maps, durations, and missing or excessive segments", () => {
  const invalid = [
    "<html>Provider error</html>",
    PLAYLIST.replace('#EXT-X-MAP:URI="init.mp4"\n', ""),
    PLAYLIST.replace('#EXT-X-MAP:URI="init.mp4"', '#EXT-X-MAP:URI="init.mp4"\n#EXT-X-MAP:URI="other.mp4"'),
    PLAYLIST.replace("#EXTINF:4.0,", "#EXTINF:0,"),
    PLAYLIST.replace("#EXTINF:4.0,", "#EXTINF:NaN,"),
    PLAYLIST.replace("#EXTINF:4.0,", "#EXTINF:4.0,\n#EXTINF:4.0,"),
    PLAYLIST.replace("segment2.m4s\n", ""),
    '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-ENDLIST',
    '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n' + "#EXTINF:1,\nsegment.m4s\n".repeat(2001) + "#EXT-X-ENDLIST",
  ];
  for (const text of invalid) assert.throws(() => parseHlsManifest(text, BASE));
  assert.equal(parseHlsManifest('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n' + "#EXTINF:1,\nsegment.m4s\n".repeat(2000) + "#EXT-X-ENDLIST", BASE).segments.length, 2000);
});

test("HLS validates every map and late segment destination before requesting any media", async () => {
  for (const destination of ["https://evil.example/segment.m4s", "http://cf-hls-media.sndcdn.com/segment.m4s",
    "https://cf-hls-media.sndcdn.com.evil.example/segment.m4s", "https://user:secret@cf-hls-media.sndcdn.com/segment.m4s",
    "https://127.0.0.1/segment.m4s", "https://r1.googlevideo.com/segment.m4s", "file:///private/file", "//evil.example/file"]) {
    for (const original of ["init.mp4", "segment2.m4s"]) {
      const { request, calls } = fixture({ [BASE]: PLAYLIST.replace(original, destination) });
      await assert.rejects(async () => collect(await createHlsMediaStream(BASE, request)));
      assert.deepEqual(calls.map(({ url }) => url), [BASE]);
    }
  }
});

test("HLS independently bounds actual manifest and initialization bytes", async () => {
  for (const overrides of [
    { [BASE]: PLAYLIST + "#".repeat(MIB) },
    { [INIT_URL]: Buffer.concat([INIT, Buffer.alloc(MIB)]) },
  ]) {
    const { request, calls, streams } = fixture(overrides);
    await assert.rejects(async () => collect(await createHlsMediaStream(BASE, request)));
    assert.equal(calls.some(({ url }) => url === SEGMENT_URLS[0]), false);
    assert.ok(streams.every((stream) => stream.destroyed));
  }
  assert.throws(() => parseHlsManifest(PLAYLIST + "#".repeat(MIB), BASE));
});

test("HLS enforces the whole-file byte limit even without upstream Content-Length", async () => {
  const { request, streams } = fixture();
  await assert.rejects(async () => collect(await createHlsMediaStream(BASE, request, {
    maxBytes: INIT.length + SEGMENTS[0].length + SEGMENTS[1].length - 1,
  })));
  assert.ok(streams.every((stream) => stream.destroyed));
});

test("HLS checks the initialization and fragment signatures including split header chunks", async () => {
  for (const overrides of [
    { [INIT_URL]: Buffer.from("<html>upstream failed</html>") },
    { [INIT_URL]: box("ftyp", Buffer.alloc(32)) },
    { [SEGMENT_URLS[0]]: Buffer.from("<html>upstream failed</html>") },
    { [SEGMENT_URLS[0]]: Buffer.alloc(0) },
  ]) {
    const { request, streams } = fixture(overrides);
    await assert.rejects(async () => collect(await createHlsMediaStream(BASE, request)));
    assert.ok(streams.every((stream) => stream.destroyed));
  }
  const fragmented = Readable.from([SEGMENTS[0].subarray(0, 3), SEGMENTS[0].subarray(3, 7), SEGMENTS[0].subarray(7)]);
  const { request } = fixture({ [SEGMENT_URLS[0]]: fragmented });
  assert.deepEqual(await collect(await createHlsMediaStream(BASE, request)), Buffer.concat([INIT, ...SEGMENTS]));
});

test("HLS propagates request and body failures without fetching subsequent segments", async () => {
  const failure = Object.assign(new Error("upstream aborted"), { name: "AbortError" });
  for (const value of [failure, Readable.from((async function* () { yield SEGMENTS[0].subarray(0, 10); throw failure; })())]) {
    const { request, calls, streams } = fixture({ [SEGMENT_URLS[0]]: value });
    await assert.rejects(async () => collect(await createHlsMediaStream(BASE, request)), (error) => error === failure);
    assert.equal(calls.some(({ url }) => url === SEGMENT_URLS[1]), false);
    assert.ok(streams.every((stream) => stream.destroyed));
  }
});

test("destroying an HLS transfer closes a stalled upstream segment", { timeout: 1000 }, async (t) => {
  const upstream = new PassThrough();
  t.after(() => upstream.destroy());
  let reached;
  const segmentStarted = new Promise((resolve) => { reached = resolve; });
  const { request: respond } = fixture({ [SEGMENT_URLS[0]]: upstream });
  const request = async (...args) => {
    const response = await respond(...args);
    if (args[0] === SEGMENT_URLS[0]) reached();
    return response;
  };
  const output = await createHlsMediaStream(BASE, request);
  const rejected = assert.rejects(collect(output), /cancelled/);
  await segmentStarted;
  output.destroy(new Error("transfer cancelled"));
  await rejected;
  await nextTurn();
  assert.equal(upstream.destroyed, true);
});

test("HLS cancellation also closes a response that arrives after the transfer was destroyed", { timeout: 1000 }, async (t) => {
  const upstream = new PassThrough();
  let release;
  const pendingResponse = new Promise((resolve) => { release = resolve; });
  t.after(() => { release(); upstream.destroy(); });
  let reached;
  const segmentStarted = new Promise((resolve) => { reached = resolve; });
  const { request: respond } = fixture({ [SEGMENT_URLS[0]]: upstream });
  const request = async (...args) => {
    const response = await respond(...args);
    if (args[0] === SEGMENT_URLS[0]) { reached(); await pendingResponse; }
    return response;
  };
  const output = await createHlsMediaStream(BASE, request);
  const rejected = assert.rejects(collect(output), /cancelled/);
  await segmentStarted;
  output.destroy(new Error("transfer cancelled"));
  release();
  await rejected;
  await nextTurn();
  assert.equal(upstream.destroyed, true);
});
