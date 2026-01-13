const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Twitter / X Downloader Service
 * @param {string} tweetUrl
 */
async function twitterDownloader(tweetUrl) {
  if (!tweetUrl) throw new Error("Tweet URL is required");

  const endpoint = "https://savetwitter.net/api/ajaxSearch";

  const form = new URLSearchParams({
    q: tweetUrl,
    lang: "en",
    cftoken: "",
  });

  const { data } = await axios.post(endpoint, form.toString(), {
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://savetwitter.net",
      referer: "https://savetwitter.net/en4",
      "x-requested-with": "XMLHttpRequest",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
    timeout: 15000,
  });

  if (data.status !== "ok") {
    throw new Error("Failed to fetch Twitter media");
  }

  const $ = cheerio.load(data.data);

  const tweetId = $("#TwitterId").val() || null;
  const title =
    $(".tw-middle h3").first().text().trim() || null;
  const duration =
    $(".tw-middle p").first().text().trim() || null;
  const thumbnail =
    $(".thumbnail img").attr("src") ||
    $(".download-items__thumb img").attr("src") ||
    null;

  const videos = [];
  const images = [];

  // Video links
  $(".tw-button-dl").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text();

    if (!href || !href.includes("dl.snapcdn.app")) return;

    // MP4 videos
    if (text.includes("MP4")) {
      const qualityMatch = text.match(/\((\d+p)\)/);
      videos.push({
        quality: qualityMatch ? qualityMatch[1] : "unknown",
        url: href,
      });
    }

    // Image download button
    if (text.includes("图片")) {
      images.push({ url: href });
    }
  });

  // Photo-only tweets
  $(".photo-list img").each((_, img) => {
    const src = $(img).attr("src");
    if (src) images.push({ url: src });
  });

  // Sort videos: highest → lowest quality
  videos.sort((a, b) => {
    const qa = parseInt(a.quality) || 0;
    const qb = parseInt(b.quality) || 0;
    return qb - qa;
  });

  return {
    type: videos.length ? "video" : "photo",
    tweetId,
    title,
    duration,
    thumbnail,
    videos,
    images,
  };
}

module.exports = { twitterDownloader };