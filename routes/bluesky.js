const express = require("express");
const router = express.Router();
const { handleBlueskyDownload } = require("../controllers/blueskyController");

router.get("/download", handleBlueskyDownload);

module.exports = router;
