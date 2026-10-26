const { twitterDownloader } = require("../services/twitterService");
const { createDownloadController } = require("../lib/downloadController");

const handleTwitterDownload = createDownloadController(twitterDownloader);

module.exports = { handleTwitterDownload };
