const express = require("express");
const router = express.Router();
const { handleTikTokDownload } = require("../controllers/tiktokController");

router.get("/download", handleTikTokDownload);

module.exports = router;
