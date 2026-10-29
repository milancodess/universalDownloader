const { fetchBlueskyMedia } = require("../services/blueskyService");
const { createDownloadController } = require("../lib/downloadController");

const handleBlueskyDownload = createDownloadController(fetchBlueskyMedia);

module.exports = { handleBlueskyDownload };
