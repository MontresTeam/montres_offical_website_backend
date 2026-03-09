const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

// Cart schema
const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: { type: Number, required: true, default: 1 },
});

// Wishlist schema
const wishlistItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  addedAt: { type: Date, default: Date.now },
});

const wishlistGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  publicSlug: { type: String, unique: true, sparse: true },
  items: [wishlistItemSchema],
});

// Address Schema
const addressSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    phone: String,
    email: String,
    country: String,
    state: String,
    city: String,
    street: String,
    address1: String,
    address2: String,
    postalCode: String,
  },
  { _id: false }
);

// Order schema
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: { type: Number, required: true },
    },
  ],
  totalAmount: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ["card", "cash", "wallet"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: [validator.isEmail, "Invalid Email"],
    },
    password: {
      type: String,
      minlength: 8,
      required: function () {
        return !this.googleId && !this.facebookId;
      },
    },
    googleId: { type: String, unique: true, sparse: true },
    facebookId: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    provider: { type: String, enum: ["local", "google", "facebook"], default: "local" },
    resetPasswordToken: String,
    refreshToken: String,
    cart: [cartItemSchema],
    wishlistGroups: [wishlistGroupSchema],
    // ✅ ADDRESSES
    shippingAddress: { type: addressSchema, default: {} },
    billingAddress: { type: addressSchema, default: {} }, // ✅ NEW
    myOrders: [orderSchema],
    lastSeen: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
