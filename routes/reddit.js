const express = require("express");
const router = express.Router();
const { handleRedditDownload } = require("../controllers/redditController");

/**
 * @swagger
 * /api/reddit/download:
 *   get:
 *     summary: Download Reddit media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Reddit post URL to download
 *         schema:
 *           type: string
 *           example: https://www.reddit.com/r/Nepal/comments/1m66ofk/annapurna_base_camp_trek_in_monsoon_season/
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

router.get("/download", handleRedditDownload);

module.exports = router;
