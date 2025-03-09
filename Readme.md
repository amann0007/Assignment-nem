const redis = require("redis");

// Create a Redis client
const client = redis.createClient();

client.on("error", (err) => {
  console.error("Error connecting to Redis:", err);
});

// Connect to Redis
client.connect().then(async () => {
  try {
    // Store a key-value pair
    await client.set("name", "John Doe");
    console.log("Key stored successfully.");

    // Retrieve the stored value
    const value = await client.get("name");
    console.log("Retrieved value:", value);

    // Delete the key
    await client.del("name");
    console.log("Key deleted successfully.");
  } catch (error) {
    console.error("Error performing Redis operations:", error);
  } finally {
    // Close the connection
    client.quit();
  }
});