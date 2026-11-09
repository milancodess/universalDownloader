const axios = require("axios");
const cheerio = require("cheerio");

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

    if (data.status !== "ok" || !data.data) {
      throw new Error("Tikvideo returned invalid response");
    }

    const $ = cheerio.load(data.data);

    const thumbnail =
      $(".tik-left .thumbnail .image-tik img").attr("src") || null;

    const title = $(".tik-left .thumbnail .content h3").text().trim() || null;

    const duration = $(".tik-left .thumbnail .content p").text().trim() || null;

    const links = [];

    $(".tik-right .dl-action a.tik-button-dl").each((_, el) => {
      const label = $(el).text().trim();
      const url = $(el).attr("href");

      if (url && !label.toLowerCase().includes("profile")) {
        links.push({ label, url });
      }
    });

    const preview = $("#vid").attr("data-src") || null;

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
