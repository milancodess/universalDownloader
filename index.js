const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
app.use(morgan("dev"));

const routes = {
  capcut: "./routes/capcut",
  douyin: "./routes/douyin",
  linkedin: "./routes/linkedin",
  meta: "./routes/facebookInsta",
  pinterest: "./routes/pinterest",
  reddit: "./routes/reddit",
  spotify: "./routes/spotify",
  soundcloud: "./routes/soundcloud",
  threads: "./routes/threads",
  tiktok: "./routes/tiktok",
  twitter: "./routes/twitter",
  youtube: "./routes/youtube",
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
