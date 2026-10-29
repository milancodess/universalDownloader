const redditDownloader = require("../services/redditService");
const { createDownloadController } = require("../lib/downloadController");

const handleRedditDownload = createDownloadController(redditDownloader);

module.exports = { handleRedditDownload };
