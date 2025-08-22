const express = require("express");
const cors = require("cors");
const app = express();

const douyinRoutes = require("./routes/douyin");
const facebookInstaRoutes = require("./routes/facebookInsta");
const linkedinRoutes = require("./routes/linkedin");
const pinterestRoutes = require("./routes/pinterest");
const tiktokRoutes = require("./routes/tiktok");
const threadsRoutes = require("./routes/threads");
const twitterRoutes = require("./routes/twitter");
const redditRoutes = require("./routes/reddit");
const youtubeRoutes = require("./routes/youtube");

// Enable CORS for all origins (you can restrict later if needed)
app.use(cors());

app.use(express.json());
app.set("json spaces", 2);

// Routes
app.use("/api/douyin", douyinRoutes);
app.use("/api/linkedin", linkedinRoutes);
app.use("/api/meta", facebookInstaRoutes);
app.use("/api/pinterest", pinterestRoutes);
app.use("/api/tiktok", tiktokRoutes);
app.use("/api/threads", threadsRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/reddit", redditRoutes);
app.use("/api/youtube", youtubeRoutes);

app.get("/", (req, res) => {
  res.send({
    success: true,
    author: "Milan Bhandari",
    contact: "https://www.milanb.com.np/",
    msg: "Universal Downloader API is running.",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
