const path = require("node:path");
const { runWorker } = require("../lib/runWorker");

async function facebookInsta(url, options = {}) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return require("./instagramService").fetchInstagramData(url, options);
  }
  try {
    const result = await runWorker(path.join(__dirname, "facebookInstaWorker.js"), url, { signal: options.signal });
    return result;
  } catch (error) {
    throw new Error("Error fetching Meta media", { cause: error });
  }
}

module.exports = facebookInsta;
