const { scrapeKuaishou } = require("../services/kuaishouService");
const { createDownloadController } = require("../lib/downloadController");

const handleKuaishouDownload = createDownloadController(scrapeKuaishou);

module.exports = { handleKuaishouDownload };
