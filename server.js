const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Schema & Model
const LocationSchema = new mongoose.Schema({
  longitude: Number,
  latitude: Number,
  timestamp: { type: Date, default: Date.now }
});
const Location = mongoose.model("Location", LocationSchema);

// Routes
app.post("/api/push", async (req, res) => {
  try {
    const { long, lat } = req.body;
    if (typeof long !== "number" || typeof lat !== "number") {
      return res.status(400).json({ error: "Invalid long/lat values" });
    }
    const newLocation = new Location({ longitude: long, latitude: lat });
    await newLocation.save();
    res.json({ message: "Location saved", data: newLocation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/get", (req, res) => {
  res.json({ message: "hello" });
});

// Keep alive ping (self-ping every 30s)
if (process.env.SELF_URL) {
  setInterval(() => {
    axios.get(`${process.env.SELF_URL}/get`).catch((err) => {
      console.error("Keep-alive ping failed:", err.message);
    });
  }, 30 * 1000);
}

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
