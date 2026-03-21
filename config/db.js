const mongoose = require("mongoose");

const connectDB = async function () {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      family: 4, // Use IPv4 to avoid common ECONNRESET issues on Windows with Atlas
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("DB connected successfully");
  } catch (error) {
    console.error("Error initially connecting to DB:", error);
    process.exit(1);
  }
};

// Handle connection errors after initial connection
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error (background):', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose connection disconnected. Check your connection to MongoDB.');
});

module.exports = connectDB;
