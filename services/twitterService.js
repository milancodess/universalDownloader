const axios = require("../lib/httpClient");
const cheerio = require("cheerio");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");
const providerUrl = "https://savetwitter.net/en4";

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

  if (!data || data.status !== "ok" || typeof data.data !== "string") {
    throw new Error("Failed to fetch Twitter media");
  }

  const $ = cheerio.load(data.data);

  const tweetId = $("#TwitterId").val() || null;
  const title =
    $(".tw-middle h3").first().text().trim() || null;
  const duration =
    $(".tw-middle p").first().text().trim() || null;
  const thumbnail =
    resolveMediaUrl($(".thumbnail img").attr("src"), providerUrl) ||
    resolveMediaUrl($(".download-items__thumb img").attr("src"), providerUrl) ||
    null;

  const videos = [];
  const images = [];

  // Video links
  $(".tw-button-dl").each((_, el) => {
    const href = resolveMediaUrl($(el).attr("href"), providerUrl);
    const text = $(el).text();

    if (!href || new URL(href).hostname !== "dl.snapcdn.app") return;

    // MP4 videos
    if (/\bmp4\b/i.test(text)) {
      const qualityMatch = text.match(/\((\d+p)\)/i);
      videos.push({
        quality: qualityMatch ? qualityMatch[1] : "unknown",
        url: href,
      });
    }

    // Image download button
    if (/\b(?:jpe?g|png|webp|image|photo)\b|图片/i.test(text)) {
      images.push({ url: href });
    }
  });

  // Photo-only tweets
  $(".photo-list img").each((_, img) => {
    const src = resolveMediaUrl($(img).attr("src"), providerUrl);
    if (src) images.push({ url: src });
  });

  // Sort videos: highest → lowest quality
  videos.sort((a, b) => {
    const qa = parseInt(a.quality) || 0;
    const qb = parseInt(b.quality) || 0;
    return qb - qa;
  });

  if (!videos.length && !images.length) {
    throw new Error("No media found");
  }

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
