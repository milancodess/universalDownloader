# universalDownloader

[![GitHub stars](https://img.shields.io/github/stars/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/network/members)

A universal media downloader API built with Node.js and Express.  
Download media from LinkedIn,Threads, Reddit, Facebook, Instagram, TikTok, YouTube, Pinterest, Twitter, Douyin and more — all in one easy-to-use API.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=milancodess/universalDownloader&type=Date)](https://www.star-history.com/#milancodess/universalDownloader&Date)

---

## Features

- Download media from popular platforms:
  - Douyin
  - Facebook & Instagram ( meta )
  - LinkedIn
  - Pinterest
  - Reddit
  - Threads
  - TikTok
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

3. Example API request to download Instagram media:

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

## API Endpoints

| Endpoint                  | Description                       | Method |
| ------------------------- | --------------------------------- | ------ |
| `/api/douyin/download`    | Download Facebook/Instagram media | GET    |
| `/api/linkedin/download`  | Download Facebook/Instagram media | GET    |
| `/api/meta/download`      | Download Facebook/Instagram media | GET    |
| `/api/pinterest/download` | Download Pinterest media          | GET    |
| `/api/reddit/download`    | Download Reddit media             | GET    |
| `/api/threads/download`   | Download Threads media            | GET    |
| `/api/tiktok/download`    | Download TikTok media             | GET    |
| `/api/twitter/download`   | Download TikTok media             | GET    |
| `/api/youtube/download`   | Download YouTube media            | GET    |

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
