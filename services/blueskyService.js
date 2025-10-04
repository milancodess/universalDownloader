const axios = require("axios");
const cheerio = require("cheerio");

async function fetchBlueskyMedia(postUrl) {
  const encodedUrl = encodeURIComponent(postUrl);
  const fullUrl = `https://bskysaver.com/download?url=${encodedUrl}`;

  try {
    const response = await axios.get(fullUrl, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua":
          '"Chromium";v="140", "Not=A?Brand";v="24", "Brave";v="140"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "upgrade-insecure-requests": "1",
      },
    });

    const $ = cheerio.load(response.data);

    const section = $("section.content__section.download_result_section");

    const videoUrl = section.find("video").attr("src") || null;
    const thumbnail = section.find("video").attr("poster") || null;

    const profileImg =
      section.find(".download__item__profile_pic img").attr("src") || null;
    const name =
      section
        .find(".download__item__profile_pic div")
        .first()
        .contents()
        .filter(function () {
          return this.type === "text";
        })
        .text()
        .trim() || null;
    const handle =
      section.find(".download__item__profile_pic span").text().trim() || null;

    const caption =
      section.find(".download__item__caption__text").text().trim() || null;
    const downloadLink = section.find("table tr td a.btn").attr("href") || null;

    if (!videoUrl && !downloadLink) {
      throw new Error("No media found in the provided Bluesky post.");
    }

    return {
      profile: {
        name,
        handle,
        profileImg,
      },
      caption,
      videoUrl,
      thumbnail,
      downloadLink,
    };
  } catch (error) {
    throw new Error("Failed to scrape Bluesky media: " + error.message);
  }
}

module.exports = { fetchBlueskyMedia };
