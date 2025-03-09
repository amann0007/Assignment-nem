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
});
const todoSchema = new mongoose.Schema({
  title: String,
  description: String,
  status: { type: String, enum: ["Pending", "Completed"], default: "Pending" },
  userId: mongoose.Schema.Types.ObjectId,
});

const User = mongoose.model("User", userSchema);
const Todo = mongoose.model("Todo", todoSchema);

const client = redis.createClient();
client.connect();

// Signup Route
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
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
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Middleware for Authentication
const authenticate = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Get Todos with Redis Caching
app.get("/todos", authenticate, async (req, res) => {
  const cacheKey = `todos:${req.userId}`;
  const cachedTodos = await client.get(cacheKey);
  if (cachedTodos) return res.json(JSON.parse(cachedTodos));
  const todos = await Todo.find({ userId: req.userId });
  await client.setEx(cacheKey, 180, JSON.stringify(todos));
  res.json(todos);
});

// Create Todo
app.post("/todos", authenticate, async (req, res) => {
  const { title, description } = req.body;
  const todo = new Todo({ title, description, userId: req.userId });
  await todo.save();
  await client.del(`todos:${req.userId}`);
  res.json({ message: "Todo created" });
});

// Cron Job to Log Pending Todos
cron.schedule("*/2 * * * *", async () => {
  const pendingTodos = await Todo.find({ status: "Pending" });
  console.log("Pending Todos:", pendingTodos);
});

app.listen(3000, () => console.log("Server running on port 3000"));