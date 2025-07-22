const axios = require("axios");
const cheerio = require("cheerio");

async function fetchDouyinVideoInfo(douyinUrl) {
  try {
    const params = new URLSearchParams({
      q: douyinUrl,
      lang: "en",
      cftoken: "",
    });

    const response = await axios.post(
      "https://savetik.co/api/ajaxSearch",
      params.toString(),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          Referer: "https://savetik.co/en/douyin-downloader",
          accept: "*/*",
          "accept-language": "en-US,en;q=0.5",
        },
      }
    );

    if (response.data.status !== "ok") {
      throw new Error("API returned error: " + JSON.stringify(response.data));
    }

    const $ = cheerio.load(response.data.data);

    const thumbnail =
      $(".tik-left .thumbnail .image-tik img").attr("src") || null;
    const title = $(".tik-left .thumbnail .content h3").text().trim() || null;
    const timestamp =
      $(".tik-left .thumbnail .content p").text().trim() || null;

    const videoLinks = [];
    $(".tik-right .dl-action a.tik-button-dl").each((i, el) => {
      videoLinks.push({
        label: $(el).text().trim(),
        url: $(el).attr("href"),
      });
    });

    if (
      videoLinks.length > 0 &&
      videoLinks[videoLinks.length - 1].label.toLowerCase().includes("profile")
    ) {
      videoLinks.pop();
    }

    return {
      thumbnail,
      title,
      timestamp,
      videoLinks,
    };
  } catch (error) {
    throw error;
  }
}

module.exports = { fetchDouyinVideoInfo };
