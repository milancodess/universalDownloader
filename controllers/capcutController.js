const { fetchCapcutData } = require("../services/capcutService");

async function handleCapcutDownload(req, res) {
  const { url } = req.query;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "Missing 'url' query parameter." });
  }

  try {
    const data = await fetchCapcutData(url);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { handleCapcutDownload };
