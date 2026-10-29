const { fetchPinterestMedia } = require("../services/pinterestService");
const { createDownloadController } = require("../lib/downloadController");

const handlePinterestDownload = createDownloadController(fetchPinterestMedia);

module.exports = { handlePinterestDownload };
