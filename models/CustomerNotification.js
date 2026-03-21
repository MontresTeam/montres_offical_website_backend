const mongoose = require("mongoose");

const customerNotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        offerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Offer",
        },
        read: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("CustomerNotification", customerNotificationSchema);
