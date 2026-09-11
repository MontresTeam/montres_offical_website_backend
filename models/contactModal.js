const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    replyMessage: { type: String, required: true },
    senderEmail: { type: String, default: "" },
    senderName: { type: String, default: "Montres Support" },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const contactFormSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },

    country: {
      type: String,
      default: "AE",
    },

    companyName: {
      type: String,
      trim: true,
      default: "",
    },

    subject: {
      type: String,
      default: "General Inquiry",
    },

    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
    },

    attachment: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["open", "pending", "resolved", "closed"],
      default: "open",
    },

    replies: [replySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactForm", contactFormSchema);
