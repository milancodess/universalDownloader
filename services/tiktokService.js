const axios = require("../lib/httpClient");
const cheerio = require("cheerio");
const qs = require("qs");

async function fetchTikTokData(videoUrl) {
  try {
    const body = qs.stringify({
      id: videoUrl,
      locale: "en",
      tt: "dHl6Ylg4",
    });

    const res = await axios.post("https://ssstik.io/abc?url=dl", body, {
      headers: {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0",
        referer: "https://ssstik.io/en-1",
        "hx-request": "true",
        "hx-target": "target",
        "hx-trigger": "_gcaptcha_pt",
      },
    });

    const html = res.data;
    if (typeof html !== "string") {
      throw new Error("Invalid response from SSSTik");
    }
    const $ = cheerio.load(html);

    const title =
      $("#avatar_and_text h2").text().trim() ||
      $("#avatarAndTextUsual h2").text().trim() ||
      null;

    const background = $("#mainpicture").css("background-image") || "";
    const backgroundUrl = background.match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i);
    const thumbnail =
      $(".result_author").attr("src") ||
      (backgroundUrl && backgroundUrl[2]) ||
      null;

    const downloads = [];

    // VIDEO / AUDIO DOWNLOADS
    $("a.download_link:not(.slide)").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const url = $(el).attr("href");

      if (!url || url.startsWith("#")) return;

      downloads.push({ text, url });
    });

    // PHOTO / SLIDE DOWNLOADS
    $("a.download_link.slide").each((_, el) => {
      const url = $(el).attr("href");

      if (!url || url.startsWith("#")) return;

      downloads.push({ url });
    });

    if (!downloads.length) {
      throw new Error("No media found");
    }

    return {
      status: true,
      title,
      thumbnail,
      downloads,
    };
  } catch (error) {
    throw new Error(`SSSTik request failed: ${error.message}`, { cause: error });
  }
}

module.exports = { fetchTikTokData };
