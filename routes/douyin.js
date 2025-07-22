const express = require("express");
const router = express.Router();
const { handleDouyinDownload } = require("../controllers/douyinController");

/**
 * @swagger
 * /api/douyin/download:
 *   get:
 *     summary: Download Douyin media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Douyin video URL to download
 *         schema:
 *           type: string
 *           example: https://v.douyin.com/b5GUZO5XH4s/
 *     responses:
 *       200:
 *         description: Media download info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing URL parameter
 *       500:
 *         description: Server error
 */
router.get("/download", handleDouyinDownload);

module.exports = router;
