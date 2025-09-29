const express = require("express");
const cors = require("cors");
const app = express();

// Enable CORS for all origins (you can restrict later if needed)
app.use(cors());

app.use(express.json());
app.set("json spaces", 2);

// Routes
app.use("/api/capcut", require("./routes/capcut"));
app.use("/api/douyin", require("./routes/douyin"));
app.use("/api/linkedin", require("./routes/linkedin"));
app.use("/api/meta", require("./routes/facebookInsta"));
app.use("/api/pinterest", require("./routes/pinterest"));
app.use("/api/tiktok", require("./routes/tiktok"));
app.use("/api/threads", require("./routes/threads"));
app.use("/api/twitter", require("./routes/twitter"));
app.use("/api/reddit", require("./routes/reddit"));
app.use("/api/spotify", require("./routes/spotify"));
app.use("/api/youtube", require("./routes/youtube"));

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
