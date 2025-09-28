const express = require("express");
const router = express.Router();
const { handleCapcutDownload } = require("../controllers/capcutController");

router.get("/download", handleCapcutDownload);

module.exports = router;
