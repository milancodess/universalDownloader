const express = require("express");
const router = express.Router();
const { handleTumblrDownload } = require("../controllers/tumblrController");

router.get("/download", handleTumblrDownload);

module.exports = router;
