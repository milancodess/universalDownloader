const snapsave = require("metadownloader");

async function facebookInsta(url) {
  try {
    const result = await snapsave(url);
    return result;
  } catch (error) {
    throw new Error("Error fetching Meta media", { cause: error });
  }
}

module.exports = facebookInsta;
