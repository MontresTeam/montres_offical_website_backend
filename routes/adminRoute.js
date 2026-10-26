const express = require("express");
const router = express.Router();
const { adminlogin } = require("../controllers/adminController");
const { getDashboardStats } = require("../controllers/dashboardController");
const { adminProtect } = require("../middlewares/authMiddleware");
const { adminLoginLimiter } = require("../middlewares/rateLimiter");
const uploadAdminProfile = require("../config/adminProfileUpload");

// POST /admin/login
// Rate limiting applied before profile upload parsing
router.post("/login", adminLoginLimiter, uploadAdminProfile, adminlogin);

// GET /admin/dashboard-stats
router.get("/dashboard-stats", adminProtect, getDashboardStats);

module.exports = router;
