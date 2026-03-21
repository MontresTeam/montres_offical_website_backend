const CustomerNotification = require("../models/CustomerNotification");
const AdminNotification = require("../models/AdminNotification");

// @desc    Get customer notifications
// @route   GET /api/notifications/customer
const getCustomerNotifications = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const notifications = await CustomerNotification.find({ userId })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching customer notifications", error: error.message });
    }
};

// @desc    Get admin notifications (admin only)
// @route   GET /api/notifications/admin
const getAdminNotifications = async (req, res) => {
    try {
        const notifications = await AdminNotification.find({ adminEmail: "admin@montres.ae" })
            .sort({ createdAt: -1 })
            .limit(100);

        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching admin notifications", error: error.message });
    }
};

// @desc    Mark customer notification as read
// @route   PATCH /api/notifications/customer/:id/read
const markCustomerAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const notification = await CustomerNotification.findOneAndUpdate(
            { _id: id, userId },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating notification", error: error.message });
    }
};

// @desc    Mark admin notification as read
// @route   PATCH /api/notifications/admin/:id/read
const markAdminAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await AdminNotification.findByIdAndUpdate(
            id,
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating notification", error: error.message });
    }
};

// @desc    Mark all customer notifications as read
// @route   PATCH /api/notifications/customer/read-all
const markAllCustomerAsRead = async (req, res) => {
    try {
        const userId = req.user?.userId;
        await CustomerNotification.updateMany({ userId, read: false }, { read: true });
        res.status(200).json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating notifications", error: error.message });
    }
};

// @desc    Mark all admin notifications as read
// @route   PATCH /api/notifications/admin/read-all
const markAllAdminAsRead = async (req, res) => {
    try {
        await AdminNotification.updateMany({ adminEmail: "admin@montres.ae", read: false }, { read: true });
        res.status(200).json({ success: true, message: "All admin notifications marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating notifications", error: error.message });
    }
};

module.exports = {
    getCustomerNotifications,
    getAdminNotifications,
    markCustomerAsRead,
    markAdminAsRead,
    markAllCustomerAsRead,
    markAllAdminAsRead,
};

