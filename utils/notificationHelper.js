const CustomerNotification = require("../models/CustomerNotification");
const AdminNotification = require("../models/AdminNotification");

/**
 * Creates a customer notification and emits a socket event
 * @param {Object} app - Express app instance
 * @param {Object} data - { userId, message, type, offerId }
 */
const createCustomerNotification = async (app, { userId, message, type, offerId }) => {
    try {
        if (!userId) return null;

        const notification = await CustomerNotification.create({
            userId,
            message,
            type,
            offerId,
        });

        const io = app.get('socketio');
        if (io) {
            io.to(userId.toString()).emit('new_customer_notification', notification);
            console.log(`Socket: Customer notification emitted to ${userId}: ${type}`);
        }

        return notification;
    } catch (error) {
        console.error("Error creating customer notification:", error);
        return null;
    }
};

/**
 * Creates an admin notification and emits a socket event
 * @param {Object} app - Express app instance
 * @param {Object} data - { message, type, offerId, actionLink }
 */
const createAdminNotification = async (app, { message, type, offerId, actionLink }) => {
    try {
        const notification = await AdminNotification.create({
            adminEmail: "admin@montres.ae",
            message,
            type,
            offerId,
            actionLink,
        });

        const io = app.get('socketio');
        if (io) {
            io.to('admin_room').emit('new_admin_notification', notification);
            console.log(`Socket: Admin notification emitted: ${type}`);
        }

        return notification;
    } catch (error) {
        console.error("Error creating admin notification:", error);
        return null;
    }
};

module.exports = {
    createCustomerNotification,
    createAdminNotification,
};

