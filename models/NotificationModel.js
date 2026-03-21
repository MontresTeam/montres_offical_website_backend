const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // Optional if we want to send to anonymous or if it's for admin
        },
        message: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["offer_submitted", "offer_accepted", "offer_rejected", "counter_offer", "counter_offer_accepted"],
            required: true,
        },
        is_read: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Notification", notificationSchema);
