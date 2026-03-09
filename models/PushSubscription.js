const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // 'admin_main' or specific admin ID
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    deviceType: { type: String, default: 'desktop' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
