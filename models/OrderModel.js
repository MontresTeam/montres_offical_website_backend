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

    // Short, customer-facing sequential order number (e.g. DM-260926-001)
    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
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
    originalPrice: { type: Number }, // Added for Make Offer system
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

    paidAt: { type: Date },

    delivered_at: { type: Date },

    stripeSessionId: { type: String, index: true },
    stripePaymentIntentId: { type: String, index: true },
    tabbySessionId: String,
    tabbyCaptureId: String,
    tamaraOrderId: { type: String, index: true },

    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "pending",
        "Paid / Awaiting Shipment",
        "paid_awaiting_shipment",
        "Processing",
        "processing",
        "Shipped",
        "shipped",
        "In Transit",
        "in_transit",
        "Out for Delivery",
        "out_for_delivery",
        "Delivered",
        "delivered",
        "Completed",
        "completed",
        "Cancelled",
        "cancelled",
        "Refunded",
        "refunded",
        "On Hold",
        "on_hold"
      ],
      default: "Pending"
    },

    // Logistics & Tracking
    trackingNumber: { type: String, default: "" },
    courierName: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    estimatedDeliveryDate: { type: Date },
    shippedAt: { type: Date },
    deliveryNotes: { type: String, default: "" },
    emailNotificationSent: { type: Boolean, default: false },
    lastNotificationSentAt: { type: Date },

    // Payment Failure & Recovery
    failureReason: { type: String, default: "" },
    paymentFailureType: { type: String, default: "none" },
    recoveryEmailSent: { type: Boolean, default: false },
    lastRecoveryEmailSentAt: { type: Date },
    recoveryEmailCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    try {
      const prefix = "DM";
      const now = new Date();
      const yy = String(now.getUTCFullYear()).slice(-2);
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(now.getUTCDate()).padStart(2, "0");
      const dateStr = `${yy}${mm}${dd}`;
      const orderPrefix = `${prefix}-${dateStr}-`;

      const OrderModel = this.constructor;
      const latestOrder = await OrderModel.findOne({
        orderNumber: new RegExp(`^${orderPrefix}\\d+$`)
      })
        .sort({ orderNumber: -1 })
        .select("orderNumber")
        .lean();

      let nextSeq = 1;
      if (latestOrder && latestOrder.orderNumber) {
        const parts = latestOrder.orderNumber.split("-");
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }

      this.orderNumber = `${orderPrefix}${String(nextSeq).padStart(3, "0")}`;
    } catch (err) {
      console.error("Error generating sequential orderNumber in Montres pre-save:", err);
    }
  }
});

module.exports = mongoose.model("Order", orderSchema);
