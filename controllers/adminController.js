const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Initialize admins from environment variables
const getAdmins = () => {
  const adminData = [
    {
      id: 1,
      username: process.env.ADMIN_CEO_USERNAME,
      password: process.env.ADMIN_CEO_PASSWORD,
      role: "ceo",
    },
    {
      id: 2,
      username: process.env.ADMIN_SALES_USERNAME,
      password: process.env.ADMIN_SALES_PASSWORD,
      role: "sales",
    },
    {
      id: 3,
      username: process.env.ADMIN_DEV_USERNAME,
      password: process.env.ADMIN_DEV_PASSWORD,
      role: "developer",
    },
    {
      id: 4,
      username: process.env.ADMIN_MARKETING_USERNAME,
      password: process.env.ADMIN_MARKETING_PASSWORD,
      role: "marketing",
    },
  ];

  return adminData.map(admin => ({
    ...admin,
    // Hash password only if it exists, otherwise use a placeholder to avoid crash
    password: admin.password ? bcrypt.hashSync(admin.password, 12) : null,
    profile: null,
  }));
};

let admins = getAdmins();

// Admin login controller
const adminlogin = async (req, res) => {
  try {
    const { username, password, profileUrl } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const admin = admins.find((a) => a.username === username);
    if (!admin || !admin.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Update profile URL if provided (in-memory persistence until server restart)
    if (profileUrl) {
      admin.profile = profileUrl;
    }

    // Generate JWT specific for Admin
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        isAdmin: true
      },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "7d" }
    );

    res
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
          id: admin.id,
          username: admin.username,
          role: admin.role,
          profile: admin.profile
        },
      });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { adminlogin, admins };
