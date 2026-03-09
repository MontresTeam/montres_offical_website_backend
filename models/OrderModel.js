const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    },
    name: String,
    price: Number,
    quantity: Number,
    sku: String,
    image: String
  },
  { _id: false }
);

// 🔒 Snapshot schema (DO NOT reference address collections)
const addressSnapshotSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    country: String,
    state: String,
    city: String,
    address1: String,
    address2: String,
    street: String,
    postalCode: String
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true
    },

    orderId: {
      type: String,
      unique: true,
      sparse: true, // Allow nulls if not all orders have this
      index: true
    },

    items: [orderItemSchema],

    subtotal: { type: Number, required: true },
    vat: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, required: true },

    currency: { type: String, default: "AED" },

    region: {
      type: String,
      enum: ["local", "gcc", "worldwide"],
      default: "local"
    },

    shippingAddress: addressSnapshotSchema,
    billingAddress: addressSnapshotSchema,

    paymentMethod: {
      type: String,
      enum: ["stripe", "tabby", "tamara"],
      required: true
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "authorized", "paid", "failed", "refunded", "closed"],
      default: "pending"
    },

    stripeSessionId: { type: String, index: true },
    stripePaymentIntentId: { type: String, index: true },
    tabbySessionId: String,
    tabbyCaptureId: String,
    tamaraOrderId: String,

    orderStatus: {
      type: String,
      enum: ["Pending", "Processing", "Completed", "Cancelled"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
