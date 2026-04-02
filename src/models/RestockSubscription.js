// models/RestockSubscription.js
const mongoose = require("mongoose");

const restockSubscriptionSchema = new mongoose.Schema({

  // Product Info
  productId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  productName: {
    type: String,
    required: true
  },

  productSKU: {
    type: String
  },

  category: {
    type: String
  },

  // Customer Info
  customerName: {
    type: String,
    default: ""
  },

  email: {
    type: String,
    required: true
  },

  phone: {
    type: String,
    default: ""
  },

  // Request Type (for admin clarity)
  requestType: {
    type: String,
    enum: ["restock", "product_request"],
    default: "restock"
  },

  // Admin Tracking
  status: {
    type: String,
    enum: ["pending", "notified"],
    default: "pending"
  },

  notified: {
    type: Boolean,
    default: false
  },

  notifiedAt: {
    type: Date
  },

  exportedToCSV: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.RestockSubscription || mongoose.model(
  "RestockSubscription",
  restockSubscriptionSchema
);
