const mongoose = require('mongoose');

const faqBotSchema = new mongoose.Schema({
    trigger: {
        type: String,
        required: true,
        unique: true
    },
    response: {
        type: String,
        required: true
    },
    options: [{
        label: { type: String, required: true },
        trigger: { type: String, required: true }
    }],
    category: {
        type: String,
        default: 'General'
    }
}, { timestamps: true });

const FaqBot = mongoose.model('FaqBot', faqBotSchema);

module.exports = FaqBot;
