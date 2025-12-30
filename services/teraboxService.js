const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

async function fetchNonce() {
  const res = await axios.get("https://teradownloaderz.com", {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(res.data);

  const scriptContent = $("#jquery-core-js-extra").html();
  if (!scriptContent) {
    throw new Error("Nonce script not found");
  }

  const nonceMatch = scriptContent.match(/"nonce":"(.*?)"/);
  if (!nonceMatch) {
    throw new Error("Nonce not found");
  }

  return nonceMatch[1];
}

async function fetchTerabox(teraboxUrl) {
  try {
    const nonce = await fetchNonce();

    const res = await axios.post(
      "https://teradownloaderz.com/wp-admin/admin-ajax.php",
      qs.stringify({
        action: "terabox_fetch",
        url: teraboxUrl,
        nonce,
      }),
      {
        headers: {
          accept: "*/*",
          "content-type":
            "application/x-www-form-urlencoded; charset=UTF-8",
          origin: "https://teradownloaderz.com",
          referer: "https://teradownloaderz.com/",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );

    return res.data;
  } catch (err) {
    throw new Error(err.message);
  }
}

module.exports = {fetchTerabox};
