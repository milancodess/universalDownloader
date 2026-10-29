const express = require("express");
const path = require("node:path");
const { youtubeJobs } = require("../lib/youtubeJobs");
const { DownloadError } = require("../lib/downloadError");

function configuredOrigin(value) {
  if (value === undefined || value === "") return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error("APP_ORIGIN must be an HTTP or HTTPS origin, such as https://downloads.example.com");
  }
}

function createYouTubeFileRouter({ manager = youtubeJobs, publicOrigin = process.env.APP_ORIGIN } = {}) {
  const router = express.Router();
  const appOrigin = configuredOrigin(publicOrigin);
  const headers = (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    next();
  };
  // Browser mutations must originate from this app. CLI clients without Origin
  // remain supported; the opaque ID alone never accepts arbitrary URLs or paths.
  const sameOrigin = (req, res, next) => {
    const origin = req.get("origin");
    // A configured public origin supports TLS termination without trusting
    // arbitrary X-Forwarded-* request headers from clients.
    const expectedOrigin = appOrigin || `${req.protocol}://${req.get("host")}`;
    if (req.get("sec-fetch-site") === "cross-site" || origin && origin !== expectedOrigin) {
      return res.status(403).json({ success: false, error: "Prepare downloads from this app's own page." });
    }
    next();
  };
  const action = (fn) => async (req, res) => {
    try { res.json({ success: true, data: await fn(req.params.id) }); }
    catch (error) {
      res.status(error instanceof DownloadError ? error.statusCode : 500).json({ success: false,
        error: error instanceof DownloadError ? error.publicMessage : "Unable to prepare this download. Try again." });
    }
  };
  router.post("/:id/prepare", headers, sameOrigin, action((id) => manager.start(id)));
  router.delete("/:id/prepare", headers, sameOrigin, action((id) => manager.cancel(id)));
  router.get("/:id/status", headers, (req, res) => {
    const status = manager.status(req.params.id);
    if (!status) return res.status(404).json({ success: false, error: "This format link has expired. Find your media again." });
    res.json({ success: true, data: status });
  });
  router.get("/:id", headers, (req, res, next) => {
    const job = manager.get(req.params.id);
    if (!job) return next();
    const file = manager.lease(req.params.id);
    if (!file) return res.status(409).json({ success: false,
      error: job.error || "Prepare this HD format first, then download the completed file.", data: manager.status(req.params.id) });
    res.once("close", file.release);
    res.download(path.basename(file.path), file.filename, { root: path.dirname(file.path), dotfiles: "deny", acceptRanges: true, cacheControl: false }, (error) => {
      file.release();
      if (error && !res.headersSent && !res.destroyed) {
        res.removeHeader("Content-Disposition");
        res.removeHeader("Content-Length");
        if (error.status === 416 || error.statusCode === 416) {
          res.set("Content-Range", `bytes */${file.sizeBytes}`);
          res.status(416).json({ success: false, error: "The requested range is outside this file." });
        } else res.status(404).json({ success: false, error: "The prepared file is no longer available. Refresh its formats." });
      }
      else if (error && !res.destroyed) res.destroy();
    });
  });
  return router;
}
module.exports = createYouTubeFileRouter();
module.exports.createYouTubeFileRouter = createYouTubeFileRouter;
