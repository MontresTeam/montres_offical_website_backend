const mongoose = require('mongoose');

const customerStatusSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
        unique: true
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const CustomerStatus = mongoose.model('CustomerStatus', customerStatusSchema);

module.exports = CustomerStatus;
