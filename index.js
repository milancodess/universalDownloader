const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("node:path");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
// Shared URLs can contain private tokens. Keep query values out of access logs.
app.use(morgan((tokens, req, res) =>
  `${tokens.method(req, res)} ${req.originalUrl.split("?")[0]} ${tokens.status(req, res)} ${tokens["response-time"](req, res)} ms`
));

app.use("/app", (req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https:; media-src 'self' https:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  next();
}, express.static(path.join(__dirname, "web"), { redirect: true }));

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
app.use("/api/files", require("./routes/youtubeFiles"));
app.use("/api/files", require("./routes/files"));

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

  if (err instanceof URIError && err.status === 400) {
    return res.status(400).json({ success: false, error: "Invalid URL encoding" });
  }

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
  const portValue = process.env.PORT ?? "3000";
  if (!/^\d+$/.test(portValue) || Number(portValue) > 65535) {
    console.error("PORT must be a number between 0 and 65535.");
    process.exitCode = 1;
  } else {
    const server = app.listen(Number(portValue), process.env.HOST, () => {
      console.log(`Universal Downloader: http://localhost:${server.address().port}/app/`);
    });
    server.on("error", (error) => {
      console.error(`Unable to start server: ${error.code || error.message}`);
      process.exitCode = 1;
    });
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      server.close();
      await require("./lib/youtubeJobs").youtubeJobs.close();
      server.closeAllConnections();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
}

module.exports = app;
