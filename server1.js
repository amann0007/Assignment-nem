const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const redis = require("redis");
const cron = require("node-cron");
require("dotenv").config();

const app = express();
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
});
const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  eventDate: Date,
  createdBy: mongoose.Schema.Types.ObjectId,
});

const User = mongoose.model("User", userSchema);
const Event = mongoose.model("Event", eventSchema);

const client = redis.createClient();
client.connect();

// Signup Route
app.post("/signup", async (req, res) => {
  const { email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword, role });
  await user.save();
  res.json({ message: "User created successfully" });
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Middleware for Authentication
const authenticate = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.role = decoded.role;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Middleware for Admin Access
const isAdmin = (req, res, next) => {
  if (req.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  next();
};

// Get Events with Redis Caching
app.get("/events", authenticate, async (req, res) => {
  const cacheKey = "events";
  const cachedEvents = await client.get(cacheKey);
  if (cachedEvents) return res.json(JSON.parse(cachedEvents));
  const events = await Event.find();
  await client.setEx(cacheKey, 300, JSON.stringify(events));
  res.json(events);
});

// Create Event
app.post("/events", authenticate, async (req, res) => {
  const { title, description, eventDate } = req.body;
  const event = new Event({ title, description, eventDate, createdBy: req.userId });
  await event.save();
  await client.del("events");
  res.json({ message: "Event created" });
});

// Delete Event with Soft Deletion in Redis
app.delete("/events/:id", authenticate, async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found" });
  
  const isAdminRequest = req.role === "admin";
  const isOwnerRequest = event.createdBy.toString() === req.userId;
  
  if (!isAdminRequest && !isOwnerRequest) {
    return res.status(403).json({ message: "Forbidden" });
  }
  
  const timeDiff = (new Date(event.eventDate) - new Date()) / (1000 * 60 * 60);
  if (timeDiff < 24) {
    await client.setEx(`deleted_event:${event._id}`, 86400, JSON.stringify(event));
  } else {
    await Event.findByIdAndDelete(req.params.id);
  }
  await client.del("events");
  res.json({ message: "Event deleted" });
});

// Cron Job to Clean Expired Events
cron.schedule("*/5 * * * *", async () => {
  const keys = await client.keys("deleted_event:*");
  for (let key of keys) {
    await client.del(key);
  }
  console.log("Expired events cleaned from Redis.");
});

app.listen(3000, () => console.log("Server running on port 3000"));
