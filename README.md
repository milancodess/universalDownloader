# universalDownloader

[![GitHub stars](https://img.shields.io/github/stars/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/network/members)

[![Join our Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?logo=discord&logoColor=white)](https://discord.gg/qG9cCvEtA3)

A universal media downloader API built with Node.js and Express.  
Download media from LinkedIn,Threads, Reddit, Facebook, Instagram, TikTok, YouTube, Pinterest, Twitter, Douyin and more — all in one easy-to-use API.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=milancodess/universalDownloader&type=Date)](https://www.star-history.com/#milancodess/universalDownloader&Date)

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

```bash
git clone https://github.com/milancodess/universalDownloader.git
cd universalDownloader
npm install
```

---

## Usage

1. Start the server:

```bash
npm start
```

2. Access API at:
   [http://localhost:3000/](http://localhost:3000/)

3. Visit the built-in playground UI at [http://localhost:3000](http://localhost:3000).

4. Example API request to download Instagram media:

```
GET http://localhost:3000/api/meta/download?url=https://www.instagram.com/p/DLHQfPiyucu/
```

Response:

```json
{
  "success": true,
  "data": {
    // media download info here
  }
}
```

---

## Frontend playground

- The `/public` directory now contains a lightweight single-page interface.
- The Express server automatically serves this UI, so landing on `/` opens the playground.
- Select any provider, paste a content URL, and inspect both the raw JSON response and the detected download links in one place.

---

## Deploying to Vercel

1. Ensure dependencies are installed with `npm install` and the server works locally via `npm run dev`.
2. Authenticate with the Vercel CLI (`npm i -g vercel` and `vercel login`) or connect the GitHub repo to a Vercel project.
3. Deploy with `vercel --prod` (CLI) or by pushing to your default branch to trigger the GitHub → Vercel pipeline.

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
├── server.js          # Express app entry point
└── package.json
```

---

## Contributing

Feel free to open issues or submit pull requests!
If you want to add support for other platforms or improve error handling, you're welcome!

---

## Author

Milan Bhandari — [GitHub](https://github.com/milancodess)
