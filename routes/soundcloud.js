const express = require("express");
const router = express.Router();
const {
  handleSoundcloudDownload,
} = require("../controllers/soundcloudController");

router.get("/download", handleSoundcloudDownload);

module.exports = router;
