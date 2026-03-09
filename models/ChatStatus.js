const mongoose = require('mongoose');

const chatStatusSchema = new mongoose.Schema({
    isOnline: {
        type: Boolean,
        default: true
    },
    adminId: {
        type: String,
        default: 'admin_main'
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const ChatStatus = mongoose.model('ChatStatus', chatStatusSchema);

module.exports = ChatStatus;
