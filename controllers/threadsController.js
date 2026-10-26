const threadsDownloader = require("../services/threadsService");
const { createDownloadController } = require("../lib/downloadController");

const handleThreadsDownload = createDownloadController(threadsDownloader);

module.exports = { handleThreadsDownload };
