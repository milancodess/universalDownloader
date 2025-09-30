const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
app.use(morgan("dev"));

const routes = {
  capcut: "./routes/capcut.js",
  douyin: "./routes/douyin.js",
  linkedin: "./routes/linkedin.js",
  meta: "./routes/facebookInsta.js",
  pinterest: "./routes/pinterest.js",
  reddit: "./routes/reddit.js",
  spotify: "./routes/spotify.js",
  soundcloud: "./routes/soundcloud.js",
  threads: "./routes/threads.js",
  tiktok: "./routes/tiktok.js",
  twitter: "./routes/twitter.js",
  youtube: "./routes/youtube.js",
};

for (const [key, routePath] of Object.entries(routes)) {
  app.use(`/api/${key}`, require(routePath));
}

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    author: "Milan Bhandari",
    contact: "https://www.milanb.com.np/",
    message: "Universal Downloader API is running",
    endpoints: Object.keys(routes).map((r) => `/api/${r}`),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
