const threadsDownloader = require("../services/threadsService");

async function handleThreadsDownload(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter." });
  }

  try {
    const result = await threadsDownloader(url);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { handleThreadsDownload };
