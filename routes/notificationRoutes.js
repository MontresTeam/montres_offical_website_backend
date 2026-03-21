const express = require("express");
const {
    getCustomerNotifications,
    getAdminNotifications,
    markCustomerAsRead,
    markAdminAsRead,
    markAllCustomerAsRead,
    markAllAdminAsRead,
} = require("../controllers/notificationController");
const { adminProtect, protect } = require("../middlewares/authMiddleware");

const router = express.Router();

// Customer Notifications
router.get("/customer", protect, getCustomerNotifications);
router.patch("/customer/:id/read", protect, markCustomerAsRead);
router.patch("/customer/read-all", protect, markAllCustomerAsRead);

// Admin Notifications
router.get("/admin", adminProtect, getAdminNotifications);
router.patch("/admin/:id/read", adminProtect, markAdminAsRead);
router.patch("/admin/read-all", adminProtect, markAllAdminAsRead);

module.exports = router;

