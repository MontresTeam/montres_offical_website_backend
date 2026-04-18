const mongoose = require("mongoose");

const userOfferSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerOffer",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate mapping of same offer to same user
userOfferSchema.index({ user: 1, offer: 1 }, { unique: true });

module.exports = mongoose.model("UserOffer", userOfferSchema);
