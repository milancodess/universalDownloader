const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
app.use(morgan("dev"));

app.use("/api/bluesky", require("./routes/bluesky"));
app.use("/api/capcut", require("./routes/capcut"));
app.use("/api/dailymotion", require("./routes/dailymotion"));
app.use("/api/douyin", require("./routes/douyin"));
app.use("/api/kuaishou", require("./routes/kuaishou"));
app.use("/api/linkedin", require("./routes/linkedin"));
app.use("/api/meta", require("./routes/facebookInsta"));
app.use("/api/pinterest", require("./routes/pinterest"));
app.use("/api/reddit", require("./routes/reddit"));
app.use("/api/spotify", require("./routes/spotify"));
app.use("/api/snapchat", require("./routes/snapchat"));
app.use("/api/soundcloud", require("./routes/soundcloud"));
app.use("/api/terabox", require("./routes/terabox"));
app.use("/api/threads", require("./routes/threads"));
app.use("/api/tiktok", require("./routes/tiktok"));
app.use("/api/tumblr", require("./routes/tumblr"));
app.use("/api/twitter", require("./routes/twitter"));
app.use("/api/youtube", require("./routes/youtube"));

const endpoints = [
  "/api/bluesky",
  "/api/capcut",
  "/api/dailymotion",
  "/api/douyin",
  "/api/kuaishou",
  "/api/linkedin",
  "/api/meta",
  "/api/pinterest",
  "/api/reddit",
  "/api/snapchat",
  "/api/spotify",
  "/api/soundcloud",
  "/api/terabox",
  "/api/threads",
  "/api/tiktok",
  "/api/tumblr",
  "/api/twitter",
  "/api/youtube",
];

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    author: "Milan Bhandari",
    contact: "https://www.milanb.com.np/",
    message: "Universal Downloader API is running",
    endpoints,
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const bodyErrors = {
    "entity.parse.failed": [400, "Invalid JSON body"],
    "entity.too.large": [413, "Request body too large"],
    "charset.unsupported": [415, "Unsupported request charset"],
    "encoding.unsupported": [415, "Unsupported content encoding"],
    "request.aborted": [400, "Request aborted"],
    "request.size.invalid": [400, "Invalid request body size"],
  };
  if (Object.hasOwn(bodyErrors, err.type)) {
    const [status, error] = bodyErrors[err.type];
    return res.status(status).json({
      success: false,
      error,
    });
  }

  console.error("❌ Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
