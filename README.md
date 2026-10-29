# universalDownloader

[![GitHub stars](https://img.shields.io/github/stars/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/network/members)

[![Join our Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?logo=discord&logoColor=white)](https://discord.gg/qG9cCvEtA3)

A universal media downloader API built with Node.js and Express.  
Download media from LinkedIn,Threads, Reddit, Facebook, Instagram, TikTok, YouTube, Pinterest, Twitter, Douyin and more — all in one easy-to-use API.

---

## Star History

<a href="https://www.star-history.com/?repos=milancodess%2FuniversalDownloader&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=milancodess/universalDownloader&type=date&theme=dark&legend=top-left&sealed_token=OjeWJJohuJbxfX1G52tMU7CDI9ZowhfKPlR2sZhfZBKOlyIQg7CA05qrvUvVxiCrUW4j1i1qqoZYkgrUxRJ2GoXecx_UQE1xmF_ZZy5UfF6fMRKP3N0vyg" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=milancodess/universalDownloader&type=date&legend=top-left&sealed_token=OjeWJJohuJbxfX1G52tMU7CDI9ZowhfKPlR2sZhfZBKOlyIQg7CA05qrvUvVxiCrUW4j1i1qqoZYkgrUxRJ2GoXecx_UQE1xmF_ZZy5UfF6fMRKP3N0vyg" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=milancodess/universalDownloader&type=date&legend=top-left&sealed_token=OjeWJJohuJbxfX1G52tMU7CDI9ZowhfKPlR2sZhfZBKOlyIQg7CA05qrvUvVxiCrUW4j1i1qqoZYkgrUxRJ2GoXecx_UQE1xmF_ZZy5UfF6fMRKP3N0vyg" />
 </picture>
</a>

---

## Features

- Download media from popular platforms:
  - Bluesky
  - CapCut
  - Dailymotion
  - Douyin
  - Facebook & Instagram ( meta )
  - Kuaishou
  - LinkedIn
  - Pinterest
  - Reddit
  - Snapchat
  - Soundcloud
  - Spotify
  - Terabox
  - Threads
  - TikTok
  - Tumblr
  - Twitter ( X )
  - YouTube
- Easy REST API endpoints
- Browser interface with automatic platform detection, download links, and request cancellation
- Built with JavaScript
- **~~Swagger API documentation included~~**
- Modular architecture: services, controllers, routes

---

## Installation

Requires Node.js 22 or newer. CI runs on Node.js 22 and 24 on Linux and Windows.

```bash
git clone https://github.com/milancodess/universalDownloader.git
cd universalDownloader
npm ci
npm run setup:downloader
npm run setup:ffmpeg
```

---

## Usage

1. Start the server:

```bash
npm start
```

2. Open the browser interface at:
   [http://localhost:3000/app/](http://localhost:3000/app/)

   Paste a public media URL and select **Find my media**. The platform is detected
   automatically for common domains; use the platform menu for other aliases.
   YouTube and Instagram files download through this app. Their download links
   expire after 30 minutes; submit the source URL again to refresh them. Other
   providers may open a media URL in your browser; use **Save as** if it plays.
   Preview the media, switch between video, audio, and photos, then choose a file
   to save. You can paste from the clipboard, drop a link, or press Ctrl/Cmd+K to
   focus the input. Recent sources are kept only in the current page's memory;
   reopening one retrieves fresh links. Reloading or clearing the session removes
   this trail. No submitted URLs are written to browser storage.

   The header's theme button cycles through **System → Light → Dark**, shown by
   monitor, sun, and crescent-moon icons. System is the default and follows device
   appearance changes while the page is open. Your choice
   is remembered in this browser and synchronized across tabs. If browser storage is
   disabled, the choice still works for the current page. Native controls and supported
   browser chrome follow the same theme. Windows contrast themes retain explicit selection indicators.

   For YouTube HD, choose a resolution such as **1080p** or **2160p (4K)** and
   select **Prepare**. The app downloads the original video and stereo audio
   tracks, merges them into one MP4 without re-encoding, and checks the result.
   Progress distinguishes downloading, merging, and validation. Once ready,
   select **Download 1080p** or **Download 4K**. Cancellation stops the process
   tree and removes incomplete files. Only resolutions available at the source
   are offered; nothing is upscaled. Prepared previews support seeking.

   The API directory remains at [http://localhost:3000/](http://localhost:3000/).

   The studio has a custom visual system, using [Hallmark](https://github.com/Nutlope/hallmark)
   as a design critique reference. Sora and Manrope are self-hosted. Example media
   provenance is in `web/assets/credits.json` and the app's Credits dialog; font
   licenses are included under `web/fonts/`.

3. Example API request to download Instagram media (encode the complete media URL
   as a query value, especially when it contains `&` or `#`):

```
GET http://localhost:3000/api/meta/download?url=https%3A%2F%2Fwww.instagram.com%2Fp%2Faye83DjauH%2F
```

Response:

```jsonc
{
  "success": true,
  "data": {
    // media download info here
  }
}
```

The server listens on port 3000 by default; set numeric `PORT` to override it.
Set `HOST=127.0.0.1` to restrict the listener to your computer. Invalid port values
fail with a clear startup error. Requiring
`index.js` exports the Express app without starting a listener, including when
used by the configured Vercel handler.

When a reverse proxy terminates HTTPS, set `APP_ORIGIN` to the browser-facing
origin, for example `https://downloads.example.com`. This allows same-origin HD
preparation and cancellation through the proxy. The value must be an HTTP(S)
origin without credentials, a path, query, or fragment. Forwarded headers alone
do not grant access. Without this setting, the app compares the browser origin
with the request's protocol and host.

YouTube and Instagram use the official [yt-dlp](https://github.com/yt-dlp/yt-dlp)
runtime instead of third-party download sites. `npm run setup:downloader` installs
the pinned release into `.runtime/` and verifies its official SHA256 checksum.
The bundled release includes its JavaScript solver and uses this app's Node.js
runtime. Set `YTDLP_PATH` to use an existing installation. No browser cookies,
accounts, user configuration, or external plugins are read. Other deployment
environments must install a compatible runtime too; the Vercel handler alone
does not package this git-ignored binary.

`npm run setup:ffmpeg` installs a pinned [yt-dlp FFmpeg build](https://github.com/yt-dlp/FFmpeg-Builds)
and ffprobe under `.runtime/ffmpeg/`, verifying the official SHA256 before
extracting the binaries. The automatic installer supports Windows x64. On other
platforms, install FFmpeg and ffprobe and set absolute `FFMPEG_PATH` and
`FFPROBE_PATH` executable paths. Licenses and the release manifest are retained
with the local runtime. HD preparation requires a persistent Node server and
writable disk; it is not supported by a short-lived serverless handler alone.

Every download endpoint expects one HTTP or HTTPS `url` string, up to 8192
characters, without embedded credentials. Successful responses retain each
platform's existing `data` structure. Failed responses use
`{ "success": false, "error": "..." }` with these HTTP statuses:

| Status | Meaning |
| ------ | ------- |
| 400 | Missing or invalid URL, or malformed JSON body |
| 403 | Browser preparation or cancellation request from another origin |
| 404 | Unknown endpoint or expired download reference |
| 409 | HD file requested before preparation finishes |
| 413 | JSON request body exceeds 100 KiB, or selected HD format exceeds 4 GiB |
| 416 | Requested byte range falls outside a prepared file |
| 415 | Unsupported request charset or content encoding |
| 422 | Media is unavailable, private, or requires platform sign-in |
| 502 | The provider failed, returned an explicit failure, or yielded no usable media in a parsed response |
| 503 | Required media tools are missing, extraction slots are busy, or the HD queue is full |
| 507 | Insufficient disk space for preparation |
| 504 | An upstream request timed out |
| 500 | Unexpected application error |

Provider errors previously returned 500 or, in some cases, 200 with a nested
failure. Clients should handle the 502 and 504 statuses above.

---

## API Endpoints

| Endpoint                    | Description                       | Method |
| --------------------------- | --------------------------------- | ------ |
| `/api/bluesky/download`     | Download Bluesky media            | GET    |
| `/api/capcut/download`      | Download CapCut media             | GET    |
| `/api/dailymotion/download` | Download Dailymotion media        | GET    |
| `/api/douyin/download`      | Download Douyin media             | GET    |
| `/api/kuaishou/download`    | Download Kuaishou media           | GET    |
| `/api/linkedin/download`    | Download LinkedIn media           | GET    |
| `/api/meta/download`        | Download Facebook/Instagram media | GET    |
| `/api/pinterest/download`   | Download Pinterest media          | GET    |
| `/api/reddit/download`      | Download Reddit media             | GET    |
| `/api/snapchat/download`    | Download Snapchat media           | GET    |
| `/api/soundcloud/download`  | Download Soundcloud media         | GET    |
| `/api/spotify/download`     | Download Spotify media            | GET    |
| `/api/terabox/download`     | Download Terabox media            | GET    |
| `/api/threads/download`     | Download Threads media            | GET    |
| `/api/tiktok/download`      | Download TikTok media             | GET    |
| `/api/tumblr/download`      | Download Tumblr media             | GET    |
| `/api/twitter/download`     | Download Twitter media            | GET    |
| `/api/youtube/download`     | Download YouTube media            | GET    |
| `/api/files/:id`            | Stream an app-issued media attachment | GET |

YouTube/Instagram response URLs such as `/api/files/<uuid>` are relative to this
server. They identify temporary download tickets, not arbitrary proxy targets.
Restarting the app invalidates them. Direct CDN file responses validate the media
bytes and set `Content-Disposition: attachment`; they are limited to 512 MiB and
five minutes. Prepared HD files use the separate workflow below and support files
up to 4 GiB, byte ranges, and seeking.
Only supported Googlevideo, Instagram, and Facebook CDN hosts are allowed,
including after redirects. Extractor headers and signed source URLs remain on
the server.

YouTube items with `preparation: true` require `POST <url>/prepare`, then polling
`GET <url>/status`. Both return `{success:true,data:{state,phaseLabel,progress,...}}`.
States are `idle`, `queued`, `downloading`, `merging`, `validating`, `ready`,
`failed`, or `cancelled`. `progressEstimated` marks percentages calculated from
measured downloaded bytes and source size estimates. Fetch the original item URL
only when state is `ready`; `DELETE <url>/prepare` cancels work. Failed/cancelled
jobs can be retried with POST. Browser mutations must be same-origin.

There are two simultaneous preparations, four waiting slots, a 30-minute job
deadline, and a 4 GiB completed-file limit. Ready files are cached for up to
30 minutes under `.runtime/youtube-cache/`, with an 8 GiB completed-cache budget;
older unleased files may be evicted sooner if that budget is exceeded. Matching
active or ready formats are reused. Temporary merge files can use roughly twice
the finished size. Space is checked before work; failed/cancelled jobs are cleaned
up. Stale cache directories from earlier app processes are removed automatically.
Job state and media tickets live in process memory; use a single persistent app
process per cache directory. Multiple replicas need routing to the owning process
and separate cache directories or a shared job store before they can serve these
download references reliably.

**~~See the full interactive API docs with Swagger at `/api-docs`.~~**

---

## Project Structure

```
.
├── controllers/       # API route handlers
├── routes/            # Express route definitions
├── services/          # Business logic & downloader functions
├── lib/               # Shared validation, controllers, and HTTP client
├── web/               # Browser interface served at /app/
├── scripts/           # Downloader installation and explicit live verification
├── test/              # Offline regression and local HTTP integration tests
├── index.js           # Express app export and CLI entry point
├── package-lock.json  # Reproducible dependency versions
└── package.json
```

---

## Contributing

Run the regression suite before submitting changes:

```bash
npm ci
npm test
npm run test:coverage
```

Tests use mocked provider responses and local HTTP servers. They cover all 18
routes/controllers, parser fixtures, error propagation, request deadlines,
redirect loops, request/response size limits, unsafe media links, worker cleanup,
and browser URL detection/result extraction. They do not verify that live
third-party download providers are currently available.

With the app running, perform explicit real-download verification:

```bash
npm run verify:downloads
```

This retrieves public YouTube and Instagram samples through the app, validates
the downloaded MP4 containers (including YouTube audio/video tracks) and an
Instagram JPEG photo, and saves
the files and SHA256 report under `.runtime/verified/`.

For full 1080p and 4K verification (about 1.65 GB of completed media):

```bash
npm run verify:hd
```

This prepares and downloads both complete files through the app, traverses every
packet with ffprobe, checks the actual dimensions and audio stream, and decodes
the beginning and end with FFmpeg. MP4s and SHA256 reports are saved under
`.runtime/verified-hd/`. The test does not substitute short clips for full downloads.

Feel free to open issues or submit pull requests!
If you want to add support for other platforms or improve error handling, you're welcome!

---

## Provider limitations

YouTube and Instagram now extract public media directly with yt-dlp. YouTube
offers source-native video with audio through 2160p (4K), direct progressive
files, and separate audio downloads. H.264 is preferred for 1080p and VP9 for 4K,
with stereo AAC where available; MP4 compatibility at 4K depends on the player's
VP9 or AV1 support. The original frame rate and codec are preserved. Live
streams and scheduled YouTube videos are rejected. Instagram supports public
videos, photos, and carousels. Private, removed, age-restricted, or sign-in-only media can
remain unavailable; the app reports those restrictions rather than bypassing
them. Platform changes can require a newer yt-dlp release.

Live verification on 2026-10-29 downloaded the previously failing YouTube sample
`aqz-KE-bpKQ` through the app (28,523,658 bytes, H.264 video plus AAC audio) and
Instagram post `aye83DjauH` (1,017,829 bytes). Their hashes matched the direct
extractor downloads. Public Instagram photo `DfCo97ZlL5F` also downloaded through
the app as a complete JPEG (627,431 bytes). A three-video Instagram carousel downloaded in direct
extractor checks. These checks verify those public samples, not every post.

HD verification on 2026-10-29 downloaded the entire same YouTube film at
1920×1080/60 fps (H.264 + stereo AAC, 268,281,337 bytes) and 3840×2160/60 fps
(VP9 + stereo AAC, 1,373,078,566 bytes). Both are 634.625 seconds long, with
38,074 video packets and 27,331 audio packets, and passed beginning/end decoding.

The other integrations still rely on third-party download sites. SoundCloud
contains a static token and a hash tied to one track, and TikTok has a static
provider parameter. Those integrations need independent live verification.

The shared HTTP client limits each request to 15 seconds, five redirects, a
5 MiB decoded response, and a 1 MiB request body. Multi-step integrations such as
Terabox apply the timeout to each request. Facebook's `metadownloader` dependency runs
in a separate worker with the same HTTP limits and a 15-second overall deadline;
the worker is terminated on completion or timeout. Its malformed URL form
encoding is corrected inside that worker. The dependency is obfuscated, so
provider changes can still require replacing or updating the integration.
YouTube/Instagram metadata extraction has a 60-second deadline, an 8 MiB output
limit, and a maximum of three simultaneous subprocesses. Cancelling their browser
request stops the extractor process tree. Cancelling a file transfer closes its
upstream stream.

Parsed download links are restricted to HTTP(S), without embedded credentials.
The browser also filters links and renders provider text without interpreting
HTML. Provider error payloads and empty response envelopes return 502 instead of
misleading successes. Access logs omit query strings, which can contain private
share tokens. For other providers, cancelling in the browser stops waiting for
a response; an upstream request already in progress finishes within its limits.

---

## Author

Milan Bhandari — [GitHub](https://github.com/milancodess)
