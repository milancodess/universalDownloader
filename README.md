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
```

---

## Usage

1. Start the server:

```bash
npm start
```

2. Access API at:
   [http://localhost:3000/](http://localhost:3000/)

3. Example API request to download Instagram media (encode the complete media URL
   as a query value, especially when it contains `&` or `#`):

```
GET http://localhost:3000/api/meta/download?url=https%3A%2F%2Fwww.instagram.com%2Fp%2FDLHQfPiyucu%2F
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

The server listens on port 3000 by default; set `PORT` to override it. Requiring
`index.js` exports the Express app without starting a listener, including when
used by the configured Vercel handler.

Every download endpoint expects one HTTP or HTTPS `url` string, up to 8192
characters, without embedded credentials. Successful responses retain each
platform's existing `data` structure. Failed responses use
`{ "success": false, "error": "..." }` with these HTTP statuses:

| Status | Meaning |
| ------ | ------- |
| 400 | Missing or invalid URL, or malformed JSON body |
| 404 | Unknown endpoint |
| 413 | JSON request body exceeds 100 KiB |
| 415 | Unsupported request charset or content encoding |
| 502 | The provider failed, returned an explicit failure, or yielded no usable media in a parsed response |
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

**~~See the full interactive API docs with Swagger at `/api-docs`.~~**

---

## Project Structure

```
.
├── controllers/       # API route handlers
├── routes/            # Express route definitions
├── services/          # Business logic & downloader functions
├── lib/               # Shared validation, controllers, and HTTP client
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
redirect loops, and request/response size limits. They do not verify that live
third-party download providers are currently available.

Feel free to open issues or submit pull requests!
If you want to add support for other platforms or improve error handling, you're welcome!

---

## Provider limitations

The service relies on third-party download sites, whose HTML, APIs, and tokens
can change independently. In particular, the SoundCloud adapter contains a
static token and a hash tied to one track; TikTok and YouTube also contain static
provider parameters. These integrations need live verification and a supported
token-refresh mechanism before relying on them in production.

The shared HTTP client limits each request to 15 seconds, five redirects, a
5 MiB decoded response, and a 1 MiB request body. Multi-step integrations such as
Terabox apply the timeout to each request. The Meta integration is an exception:
`metadownloader` manages its own HTTP requests and exposes no timeout or
cancellation configuration. Its explicit failure results are handled by the
API, but its network requests are not covered by the shared client limits.

---

## Author

Milan Bhandari — [GitHub](https://github.com/milancodess)
