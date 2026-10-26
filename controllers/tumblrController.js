const { fetchTumblrData } = require("../services/tumblrService");
const { createDownloadController } = require("../lib/downloadController");

const handleTumblrDownload = createDownloadController(fetchTumblrData);

module.exports = { handleTumblrDownload };
