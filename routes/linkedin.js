const express = require("express");
const router = express.Router();
const { handleLinkedinDownload } = require("../controllers/linkedinController");

/**
 * @swagger
 * /api/linkedin/download:
 *   get:
 *     summary: Download LinkedIn media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The LinkedIn video URL to download
 *         schema:
 *           type: string
 *           example: https://www.linkedin.com/posts/milancodess_instahack-taggedup-coding-activity-7352015865954861056-JrVL?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEBB1-YBk1xwGZjzCFCF_np8k2_g_WTSr_U
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
router.get("/download", handleLinkedinDownload);

module.exports = router;
