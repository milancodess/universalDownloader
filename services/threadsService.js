const axios = require("axios");
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

  if (data.status !== "ok") throw new Error("Failed");

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

        if (!url || !label.includes("x")) return;

        const [width, height] = label.split("x").map(Number);

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

      photos.push({
        index: photos.length + 1,
        thumbnail,
        variants,
      });
    }

    /* ───────────── VIDEO ───────────── */
    if (item.find(".icon-dlvideo").length) {
      const thumbnail = item
        .find(".download-items__thumb img")
        .attr("src");

      const videoUrl = item
        .find('a[title="Download Video"]')
        .attr("href");

      if (!videoUrl) return;

      videos.push({
        index: videos.length + 1,
        thumbnail,
        url: videoUrl,
        format: "mp4",
      });
    }
  });

  return {
    platform: "threads",
    photoCount: photos.length,
    videoCount: videos.length,
    photos,
    videos,
  };
}

module.exports = threadsDownloader;