const express = require("express");
const router = express.Router();
const { adminlogin } = require("../controllers/adminController");
const { getDashboardStats } = require("../controllers/dashboardController");
const { adminProtect } = require("../middlewares/authMiddleware");
const uploadAdminProfile = require("../config/adminProfileUpload");

// POST /admin/login
// Optional profile upload included
router.post("/login", uploadAdminProfile, adminlogin);

// GET /admin/dashboard-stats
router.get("/dashboard-stats", adminProtect, getDashboardStats);

module.exports = router;
