require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { seedAdmins } = require("../utils/seedAdmin");
const Admin = require("../models/Admin");
const bcrypt = require("bcryptjs");

async function run() {
  console.log("🚀 Starting Admin Seeding Script...");
  try {
    await connectDB();
    const result = await seedAdmins();
    console.log("Seeding result:", result);

    // Verify bebo269 account
    const bebo = await Admin.findOne({
      $or: [{ username: "bebo269" }, { email: "bebo269@yahoo.com" }],
    });

    if (bebo) {
      console.log("\n==========================================");
      console.log("🎉 Content Manager Account Verified:");
      console.log(`- ID: ${bebo._id}`);
      console.log(`- Username: ${bebo.username}`);
      console.log(`- Email: ${bebo.email}`);
      console.log(`- Role: ${bebo.role}`);
      console.log(`- Status: ${bebo.status}`);
      const passValid = await bcrypt.compare("Montres#2026", bebo.password);
      console.log(`- Password check ('Montres#2026'): ${passValid ? "VALID ✅" : "INVALID ❌"}`);
      console.log("==========================================\n");
    } else {
      console.error("❌ Failed to verify bebo269 user in DB");
    }
  } catch (error) {
    console.error("❌ Seeding execution error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("DB connection closed. Done.");
    process.exit(0);
  }
}

run();
