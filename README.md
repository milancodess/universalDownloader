# universalDownloader

[![GitHub stars](https://img.shields.io/github/stars/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/milancodess/universalDownloader?style=social)](https://github.com/milancodess/universalDownloader/network/members)

A universal media downloader API built with Node.js and Express.  
Download media from Threads, Reddit, Facebook, Instagram, and more — all in one easy-to-use API.

---

## Features

- Download media from popular platforms:
  - Facebook & Instagram ( meta )
  - Reddit
  - Threads
  - TikTok
- Easy REST API endpoints
- Built with JavaScript
- Swagger API documentation included
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

2. Access Swagger API docs at:
   [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

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

| Endpoint                | Description                       | Method |
| ----------------------- | --------------------------------- | ------ |
| `/api/meta/download`    | Download Facebook/Instagram media | GET    |
| `/api/reddit/download`  | Download Reddit media             | GET    |
| `/api/threads/download` | Download Threads media            | GET    |
| `/api/tiktok/download`  | Download TikTok media             | GET    |

See the full interactive API docs with Swagger at `/api-docs`.

---

## Project Structure

```
.
├── controllers/       # API route handlers
├── routes/            # Express route definitions
├── services/          # Business logic & downloader functions
├── swagger.js         # Swagger configuration
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
