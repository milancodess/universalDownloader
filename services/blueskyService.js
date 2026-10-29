const axios = require("../lib/httpClient");
const cheerio = require("cheerio");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

async function fetchBlueskyMedia(postUrl) {
  const url =
    "https://bskysaver.com/download?url=" + encodeURIComponent(postUrl);

  const { data: html } = await axios.get(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      referer: "https://bskysaver.com/",
    },
  });

  if (typeof html !== "string") {
    throw new Error("Invalid response from Bluesky saver");
  }

  const $ = cheerio.load(html);
  const section = $("section.download_result_section");

  /* ───────────── PROFILE ───────────── */
  const profileBox = section.find(".download__item__profile_pic").first();

  const profile = {
    name:
      profileBox
        .find("div")
        .first()
        .contents()
        .filter((_, el) => el.type === "text")
        .text()
        .trim() || null,

    handle: profileBox.find("span").first().text().trim() || null,

    avatar: resolveMediaUrl(profileBox.find("img").first().attr("src"), url),
  };

  /* ───────────── CAPTION ───────────── */
  const caption =
    section
      .find(".download__item__caption__text")
      .first()
      .text()
      .trim() || null;

  const photos = [];
  const videos = [];

  /* ───────────── MEDIA ───────────── */
  section.find(".download_item").each((_, el) => {
    const item = $(el);

    /* IMAGE */
    if (item.find(".image_wrapper img").length) {
      const img = item.find(".image_wrapper img").first();

      const photoUrl = resolveMediaUrl(item
        .find("a.download__item__info__actions__button")
        .attr("href"), url);

      if (photoUrl) {
        photos.push({
          index: photos.length + 1,
          thumbnail: resolveMediaUrl(img.attr("src"), url),
          variants: [
            {
              resolution: "best",
              url: photoUrl,
            },
          ],
        });
      }
    }

    /* VIDEO */
    if (item.find(".video_wrapper video").length) {
      const video = item.find(".video_wrapper video").first();

      const videoUrl = [video.attr("src"), ...video.find("source").toArray().map((source) => $(source).attr("src"))]
        .map((source) => resolveMediaUrl(source, url)).find(Boolean);
      if (!videoUrl) return;

      videos.push({
        index: videos.length + 1,
        thumbnail: resolveMediaUrl(video.attr("poster"), url),
        url: videoUrl,
        format: "mp4",
      });
    }
  });

  if (!photos.length && !videos.length) {
    throw new Error("No media found");
  }

  return {
    platform: "bluesky",
    profile,
    caption,
    photoCount: photos.length,
    videoCount: videos.length,
    photos,
    videos,
  };
}

module.exports = {fetchBlueskyMedia};
