// // db.js
// const mongoose = require("mongoose");

// // Connect to MongoDB using environment variable
// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGODB_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     console.log("Database connected successfully ✅");
//   } catch (err) {
//     console.error("Database connection error ❌:", err);
//   }
// };

// module.exports = connectDB;

const mongoose = require("mongoose");

const connectDB = async function () {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected successfully");
  } catch (error) {
    console.log("error connection in db", error);
  }
};
module.exports = connectDB;
