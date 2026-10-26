const axios = require("../lib/httpClient");
const { isDownloadResult } = require("../lib/providerResponse");

async function fetchDailymotionData(videoUrl) {
  try {
    const { data } = await axios.get("https://ssdown.app/api/dailymotion", {
      params: { url: videoUrl },
      headers: {
        accept: "*/*",
        referer: "https://ssdown.app/dailymotion",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!isDownloadResult(data)) {
      throw new Error("Dailymotion provider returned no media");
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    throw new Error("Dailymotion request failed", { cause: error });
  }
}

module.exports = { fetchDailymotionData };
