const axios = require("../lib/httpClient");
const cheerio = require("cheerio");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");
const providerUrl = "https://tikvideo.app/en/download-douyin-video";

async function fetchDouyinVideoInfo(douyinUrl) {
  try {
    const params = new URLSearchParams({
      q: douyinUrl,
      lang: "en",
      cftoken: "",
    });

    const { data } = await axios.post(
      "https://tikvideo.app/api/ajaxSearch",
      params.toString(),
      {
        headers: {
          accept: "*/*",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          Referer: "https://tikvideo.app/en/download-douyin-video",
        },
      },
    );

    if (!data || data.status !== "ok" || typeof data.data !== "string") {
      throw new Error("Tikvideo returned invalid response");
    }

    const $ = cheerio.load(data.data);

    const thumbnail =
      resolveMediaUrl($(".tik-left .thumbnail .image-tik img").attr("src"), providerUrl);

    const title = $(".tik-left .thumbnail .content h3").text().trim() || null;

    const duration = $(".tik-left .thumbnail .content p").text().trim() || null;

    const links = [];

    $(".tik-right .dl-action a.tik-button-dl").each((_, el) => {
      const label = $(el).text().trim();
      const url = resolveMediaUrl($(el).attr("href"), providerUrl);

      if (url && !label.toLowerCase().includes("profile")) {
        links.push({ label, url });
      }
    });

    const preview = resolveMediaUrl($("#vid").attr("data-src"), providerUrl);

    if (!links.length && !preview) {
      throw new Error("No media found");
    }

    return {
      title,
      duration,
      thumbnail,
      preview,
      links,
    };
  } catch (err) {
    console.error("Douyin scrape failed:", err.message);
    throw err;
  }
}

module.exports = { fetchDouyinVideoInfo };
