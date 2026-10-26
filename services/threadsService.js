const axios = require("../lib/httpClient");
const cheerio = require("cheerio");

async function threadsDownloader(postUrl) {
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
    },
  });

  if (!data || data.status !== "ok" || typeof data.data !== "string") {
    throw new Error("Invalid response from LoveThreads");
  }

  const $ = cheerio.load(data.data);

  const photos = [];
  const videos = [];

  $(".download-box > li").each((index, li) => {
    const item = $(li);

    /* ───────────── PHOTO ───────────── */
    if (item.find(".icon-dlimage").length) {
      const thumbnail = item
        .find(".download-items__thumb img")
        .attr("src");

      const variants = [];

      item.find(".photo-option option").each((_, opt) => {
        const url = $(opt).attr("value");
        const label = $(opt).text().trim();

        const dimensions = label.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
        if (!url || url.startsWith("#") || !dimensions) return;

        const width = Number(dimensions[1]);
        const height = Number(dimensions[2]);
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return;

        variants.push({
          resolution: label,
          width,
          height,
          url,
        });
      });

      variants.sort(
        (a, b) => b.width * b.height - a.width * a.height
      );

      if (variants.length) {
        photos.push({
          index: photos.length + 1,
          thumbnail,
          variants,
        });
      }
    }

    /* ───────────── VIDEO ───────────── */
    if (item.find(".icon-dlvideo").length) {
      const thumbnail = item
        .find(".download-items__thumb img")
        .attr("src");

      const videoUrl = item
        .find('a[title="Download Video"]')
        .attr("href");

      if (!videoUrl || videoUrl.startsWith("#")) return;

      videos.push({
        index: videos.length + 1,
        thumbnail,
        url: videoUrl,
        format: "mp4",
      });
    }
  });

  if (!photos.length && !videos.length) {
    throw new Error("No media found");
  }

  return {
    platform: "threads",
    photoCount: photos.length,
    videoCount: videos.length,
    photos,
    videos,
  };
}

module.exports = threadsDownloader;
