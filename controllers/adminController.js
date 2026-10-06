const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
require("dotenv").config();

// Fallback in-memory admins from environment variables
const getAdmins = () => {
  const adminData = [
    {
      id: 1,
      username: process.env.ADMIN_CEO_USERNAME,
      email: process.env.ADMIN_EMAIL || "ceo@montres.ae",
      password: process.env.ADMIN_CEO_PASSWORD,
      role: "ceo",
    },
    {
      id: 2,
      username: process.env.ADMIN_SALES_USERNAME,
      email: process.env.SALES_EMAIL || "sales@montres.ae",
      password: process.env.ADMIN_SALES_PASSWORD,
      role: "sales",
    },
    {
      id: 3,
      username: process.env.ADMIN_DEV_USERNAME,
      email: "dev@montres.ae",
      password: process.env.ADMIN_DEV_PASSWORD,
      role: "developer",
    },
    {
      id: 4,
      username: process.env.ADMIN_MARKETING_USERNAME,
      email: "marketing@montres.ae",
      password: process.env.ADMIN_MARKETING_PASSWORD,
      role: "marketing",
    },
  ];

  return adminData.map((admin) => ({
    ...admin,
    password: admin.password ? bcrypt.hashSync(admin.password, 12) : null,
    profile: null,
  }));
};

let admins = getAdmins();

// Admin login controller (Authenticates via MongoDB Admin collection with in-memory fallback)
const adminlogin = async (req, res) => {
  try {
    const { username, email, identifier, password, profileUrl } = req.body;
    const loginIdentifier = (username || email || identifier || "").trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Username/Email and password are required" });
    }

    const normalizedIdentifier = loginIdentifier.toLowerCase();

    // 1. Try to find the Admin user in MongoDB
    let dbAdmin = null;
    try {
      dbAdmin = await Admin.findOne({
        $or: [
          { username: normalizedIdentifier },
          { email: normalizedIdentifier },
        ],
      });
    } catch (dbErr) {
      console.warn("⚠️ Database lookup error during admin login, falling back to memory:", dbErr.message);
    }

    if (dbAdmin) {
      // Check status
      if (dbAdmin.status && dbAdmin.status !== "active") {
        return res.status(403).json({ message: "Admin account is inactive or suspended" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, dbAdmin.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update profile URL if provided
      if (profileUrl) {
        dbAdmin.profile = profileUrl;
        await dbAdmin.save().catch((e) => console.warn("Failed to update profileUrl:", e.message));
      }

      // Generate JWT specific for Admin
      const token = jwt.sign(
        {
          id: dbAdmin._id.toString(),
          _id: dbAdmin._id.toString(),
          username: dbAdmin.username,
          email: dbAdmin.email,
          role: dbAdmin.role,
          status: dbAdmin.status || "active",
          isAdmin: true,
        },
        process.env.ADMIN_JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res
        .cookie("adminToken", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .json({
          message: "Login successful",
          token: token,
          admin: {
            id: dbAdmin._id.toString(),
            _id: dbAdmin._id.toString(),
            username: dbAdmin.username,
            email: dbAdmin.email,
            role: dbAdmin.role,
            status: dbAdmin.status || "active",
            profile: dbAdmin.profile,
          },
        });
    }

    // 2. Fallback to in-memory / env-based admins for legacy support
    const memoryAdmin = admins.find(
      (a) =>
        (a.username && a.username.toLowerCase() === normalizedIdentifier) ||
        (a.email && a.email.toLowerCase() === normalizedIdentifier)
    );

    if (!memoryAdmin || !memoryAdmin.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMemValid = await bcrypt.compare(password, memoryAdmin.password);
    if (!isMemValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (profileUrl) {
      memoryAdmin.profile = profileUrl;
    }

    const token = jwt.sign(
      {
        id: memoryAdmin.id,
        _id: memoryAdmin.id,
        username: memoryAdmin.username,
        email: memoryAdmin.email,
        role: memoryAdmin.role,
        status: "active",
        isAdmin: true,
      },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res
      .cookie("adminToken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({
        message: "Login successful",
        token: token,
        admin: {
          id: memoryAdmin.id,
          _id: memoryAdmin.id,
          username: memoryAdmin.username,
          email: memoryAdmin.email,
          role: memoryAdmin.role,
          status: "active",
          profile: memoryAdmin.profile,
        },
      });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { adminlogin, admins };
