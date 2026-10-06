const mongoose = require("mongoose");
const { seedAdmins } = require("../utils/seedAdmin");

const connectDB = async function (retries = 5, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        family: 4, // Use IPv4 to avoid common ECONNRESET issues on Windows with Atlas
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
      });
      console.log("DB connected successfully");

      // Auto-seed built-in admin accounts and categories on startup
      seedAdmins().catch((err) => {
        console.warn("⚠️ Background admin auto-seed warning:", err.message);
      });

      return;
    } catch (error) {
      console.error(`Attempt ${attempt} of ${retries} - Error initially connecting to DB:`, error.message || error);
      if (attempt < retries) {
        console.log(`Retrying DB connection in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("❌ Exceeded maximum MongoDB connection retries. Exiting process.");
        process.exit(1);
      }
    }
  }
};

// Handle connection errors after initial connection
mongoose.connection.on('error', (err) => {
  if (err.code === 'ECONNRESET' || err.name === 'MongoNetworkError' || err.name === 'MongoPoolClearedError') {
    console.warn('⚠️ Mongoose network socket reset detected - reconnecting automatically');
    return;
  }
  console.error('Mongoose connection error (background):', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose connection disconnected. Check your connection to MongoDB.');
});

module.exports = connectDB;
