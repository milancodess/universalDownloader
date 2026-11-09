const axios = require("axios");

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

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { fetchDailymotionData };
