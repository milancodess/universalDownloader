const { fetchTumblrData } = require("../services/tumblrService");

async function handleTumblrDownload(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'url' query parameter." });
    }

    const data = await fetchTumblrData(url);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { handleTumblrDownload };
