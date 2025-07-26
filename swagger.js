const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Universal Downloader API",
      version: "1.4.0",
      description:
        "API to download media from Threads, Reddit, Facebook, Instagram, etc.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local server",
      },
      {
        url: "https://universaldownloaderapi.vercel.app/",
        description: "Production server",
      },
    ],
  },
  apis: ["./routes/*.js"],
};

module.exports = swaggerJsdoc(options);
