const MAX_URL_LENGTH = 8192;

function validateUrl(value) {
  if (value === undefined || value === null || value === "") {
    throw new Error("Missing 'url' query parameter.");
  }

  const invalidMessage =
    "The 'url' query parameter must be a single HTTP or HTTPS URL without credentials (maximum 8192 characters).";

  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) {
    throw new Error(invalidMessage);
  }

  const url = value.trim();
  // URL() silently repairs some malformed inputs, including embedded newlines.
  if (!/^https?:\/\/[^/?#]/i.test(url) || /[\s\\\u0000-\u001f\u007f]/u.test(url)) {
    throw new Error(invalidMessage);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(invalidMessage);
  }

  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error(invalidMessage);
  }

  return url;
}

module.exports = { validateUrl, MAX_URL_LENGTH };
