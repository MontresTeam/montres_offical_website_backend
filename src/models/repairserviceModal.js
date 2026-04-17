const mongoose = require("mongoose");

const watchServiceSchema = new mongoose.Schema(
  {
    // Customer details
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: "+971", // Default UAE country code
    },

    // Watch details
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    manufactureYear: {
      type: Number,
      min: 1900,
      max: new Date().getFullYear(),
    },
    watchType: {
      type: String,
      enum: [
        "Automatic",
        "Quartz",
        "Mechanical",
        "Chronograph",
        "Diver",
        "Pilot",
        "Dress",
        "Smartwatch",
        "Other",
      ],
    },

    // Service details
    selectedService: {
      type: String,
      required: true,
      enum: [
        "Battery Replacement",
        "Movement Service",
        "Crystal Replacement",
        "Band Adjustment",
        "Water Resistance Testing",
        "Cleaning & Polishing",
        "Dial Repair",
        "Vintage Restoration",
      ],
    },

    // Booking status
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },

    // Images
    images: [
      {
        url: String,
        alt: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.WatchService || mongoose.model("WatchService", watchServiceSchema);
