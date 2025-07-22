const express = require("express");
const router = express.Router();
const { handleThreadsDownload } = require("../controllers/threadsController");

router.get("/download", handleThreadsDownload);

/**
 * @swagger
 * /api/threads/download:
 *   get:
 *     summary: Download Threads media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Threads post URL to download
 *         schema:
 *           type: string
 *           example: https://www.threads.com/@yociii___/post/DMZJquSI-5f?xmt=AQF0s62U33-zwlZkUUGiF9p0BdKv5TIrHlxRXPJj-Z5s3g
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

module.exports = router;
