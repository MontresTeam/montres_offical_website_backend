const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: false, // Optional for manual offers where product might be deleted or just text
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // Optional for guests if allowed, but user asked for user_id
        },
        productName: {
            type: String,
            required: true,
        },
        customerName: {
            type: String,
            required: true,
        },
        customerEmail: {
            type: String,
            required: true,
        },
        customerPhone: {
            type: String,
            trim: true,
        },
        originalPrice: {
            type: Number,
            required: true,
        },
        offerPrice: {
            type: Number,
            required: true,
        },
        offerPercentage: {
            type: Number,
            required: true,
        },
        counterPrice: {
            type: Number,
        },
        token: {
            type: String,
            unique: true,
            sparse: true,
        },
        expiresAt: {
            type: Date,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "countered", "expired", "used"],
            default: "pending",
        },
        message: {
            type: String,
        },
        counterNotes: {
            type: String,
        },
        autoApproved: {
            type: Boolean,
            default: false,
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
    },
    {
        timestamps: true,
    }
);

offerSchema.virtual("offeredPrice").get(function () {
    return this.offerPrice;
});
offerSchema.set("toJSON", { virtuals: true });
offerSchema.set("toObject", { virtuals: true });

module.exports = mongoose.models.Offer || mongoose.model("Offer", offerSchema);
