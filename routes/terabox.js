const express = require("express");
const router = express.Router();
const { handleTeraboxDownload } = require("../controllers/TeraboxController");

router.get("/download", handleTeraboxDownload);

module.exports = router;
