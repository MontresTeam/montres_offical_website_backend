const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
        type: String,
        required: true
    },
    receiverId: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['user', 'admin'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    isRead: {
        type: Boolean,
        default: false
    },
    senderName: {
        type: String
    },
    senderContact: {
        type: String
    }
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
