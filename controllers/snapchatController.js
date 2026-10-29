const { fetchSnapchat } = require("../services/snapchatService");
const { createDownloadController } = require("../lib/downloadController");

const handleSnapchat = createDownloadController(fetchSnapchat);

module.exports = { handleSnapchat };
