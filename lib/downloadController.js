const { validateUrl } = require("./validateUrl");
const { isDownloadResult } = require("./providerResponse");
const { DownloadError } = require("./downloadError");

function isTimeout(error) {
  const seen = new Set();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if (
      ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(error.code) ||
      error.name === "TimeoutError"
    ) {
      return true;
    }
    error = error.cause;
  }
  return false;
}

function createDownloadController(download) {
  return async function handleDownload(req, res) {
    let url;
    try {
      url = validateUrl(req.query?.url);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.once?.("close", disconnected);
    try {
      const data = await download(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!isDownloadResult(data, url)) {
        throw new Error("The upstream provider returned a failed response.");
      }
      return res.json({ success: true, data });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DownloadError) {
        return res.status(error.statusCode).json({ success: false, error: error.publicMessage });
      }
      const timeout = isTimeout(error);
      return res.status(timeout ? 504 : 502).json({
        success: false,
        error: timeout
          ? "The media provider timed out. Please try again."
          : "Unable to fetch media from the provider. Please try again later.",
      });
    } finally {
      res.removeListener?.("close", disconnected);
    }
  };
}

module.exports = { createDownloadController };
