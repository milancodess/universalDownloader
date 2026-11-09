const axios = require("axios");

async function fetchSoundcloudData(url) {
  try {
    const apiUrl = "https://urlmp4.com/wp-json/aio-dl/video-data/";

    const response = await axios.post(
      apiUrl,
      `url=${encodeURIComponent(
        url
      )}&token=8b6e170975d92939bb67d8db567f82e43fa2da91e00a84f258af77c1186c5e8a&hash=aHR0cHM6Ly9zb3VuZGNsb3VkLmNvbS9zb21icnNvbmdzL3VuZHJlc3NlZA%3D%3D1043YWlvLWRs`,
      {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "content-type": "application/x-www-form-urlencoded",
          priority: "u=1, i",
          "sec-ch-ua":
            '"Not)A;Brand";v="8", "Chromium";v="140", "Brave";v="140"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "sec-gpc": "1",
          cookie: "pll_language=en",
          Referer: "https://urlmp4.com/en/soundcloud-downloader/",
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`SoundCloud API request failed: ${error.message}`);
  }
}

module.exports = { fetchSoundcloudData };
