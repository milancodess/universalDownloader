const express = require("express");
const app = express();
const facebookInstaRoutes = require("./routes/facebookInsta");
const setupSwagger = require("./swagger");
const tiktokRoutes = require("./routes/tiktok");
const threadsRoutes = require("./routes/threads");
const redditRoutes = require("./routes/reddit");
const youtubeRoutes = require("./routes/youtube");

app.use(express.json());

app.use("/api/meta", facebookInstaRoutes);
app.use("/api/tiktok", tiktokRoutes);
app.use("/api/threads", threadsRoutes);
app.use("/api/reddit", redditRoutes);
app.use("/api/youtube", youtubeRoutes);

app.get("/", (req, res) => {
  res.send({ success: true, msg: "Universal Downloader API is running." });
});

setupSwagger(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
