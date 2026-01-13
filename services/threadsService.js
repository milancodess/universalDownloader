const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Threads Downloader Service
 * @param {string} postUrl
 */
async function threadsDownloader(postUrl) {
  if (!postUrl) throw new Error("Threads URL is required");

  const endpoint = "https://lovethreads.net/api/ajaxSearch";

  const form = new URLSearchParams({
    q: postUrl,
    t: "media",
    lang: "en",
  });

  const { data } = await axios.post(endpoint, form.toString(), {
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://lovethreads.net",
      referer: "https://lovethreads.net/en",
      "x-requested-with": "XMLHttpRequest",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
    timeout: 15000,
  });

  if (data.status !== "ok") {
    throw new Error("Failed to fetch Threads media");
  }

  const $ = cheerio.load(data.data);

  const videos = [];
  const images = [];

  // Thumbnail
  const thumbnail =
    $(".download-items__thumb img").attr("src") || null;

  // Video download
  $(".download-items__btn a[title='Download Video']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    videos.push({
      quality: "unknown",
      url: href,
    });
  });

  // Image resolutions (dropdown)
  $(".photo-option select option").each((_, opt) => {
    const url = $(opt).attr("value");
    const label = $(opt).text().trim(); // e.g. 1350x1080

    if (!url || !label.includes("x")) return;

    const [width, height] = label.split("x").map(Number);

    images.push({
      resolution: label,
      width,
      height,
      url,
    });
  });

  // Sort images highest → lowest resolution
  images.sort((a, b) => {
    const ra = a.width * a.height;
    const rb = b.width * b.height;
    return rb - ra;
  });

  const postId =
    postUrl.split("/post/")[1]?.split("?")[0] || null;

  return {
    platform: "threads",
    type: videos.length ? "video" : "photo",
    postId,
    thumbnail,
    videos,
    images,
  };
}

module.exports = threadsDownloader;
