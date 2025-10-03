const express = require("express");
const router = express.Router();
const { handleSnapchat } = require("../controllers/snapchatController");

router.get("/download", handleSnapchat);

module.exports = router;
