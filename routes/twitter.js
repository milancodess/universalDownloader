const express = require("express");
const router = express.Router();
const { handleTwitterDownload } = require("../controllers/twitterController");

router.get("/download", handleTwitterDownload);

module.exports = router;
