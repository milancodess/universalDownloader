const facebookInsta = require("../services/facebookInstaService");
const { createDownloadController } = require("../lib/downloadController");

const handleFacebookInstaDownload = createDownloadController(facebookInsta);

module.exports = { handleFacebookInstaDownload };
