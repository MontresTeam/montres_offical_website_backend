const mongoose = require('mongoose');

const supportLeadSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'contacted', 'resolved'],
        default: 'pending'
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const SupportLead = mongoose.model('SupportLead', supportLeadSchema);

module.exports = SupportLead;
