class DownloadError extends Error {
  constructor(message, statusCode = 502, code = "UPSTREAM_ERROR") {
    super(message);
    this.name = "DownloadError";
    this.publicMessage = message;
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = { DownloadError };
