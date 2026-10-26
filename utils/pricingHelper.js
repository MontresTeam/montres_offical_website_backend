const mongoose = require("mongoose");
const Product = require("../models/product");
const { calculateShippingFee } = require("./shippingCalculator");

/**
 * Validates checkout items and computes trusted server-side pricing from MongoDB.
 * Rejects client-supplied prices, invalid quantities, and missing products.
 *
 * @param {Array} items - Raw client items [{ productId, quantity }]
 * @returns {Promise<{ populatedItems: Array, subtotal: number, originalPriceTotal: number }>}
 */
const validateAndPriceItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("Cart items are required and must be a non-empty array");
    error.statusCode = 400;
    throw error;
  }

  const populatedItems = [];

  for (const it of items) {
    if (!it || typeof it !== "object") {
      const error = new Error("Invalid item format");
      error.statusCode = 400;
      throw error;
    }

    const productId = it.productId || it.id || it._id || it.reference_id;
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error(`Invalid or missing product ID: ${productId}`);
      error.statusCode = 400;
      throw error;
    }

    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      const error = new Error(`Invalid quantity for product ${productId}. Must be an integer between 1 and 50.`);
      error.statusCode = 400;
      throw error;
    }

    const product = await Product.findById(productId)
      .select("name images salePrice regularPrice sku referenceNumber category published stockQuantity")
      .lean();

    if (!product) {
      const error = new Error(`Product not found: ${productId}`);
      error.statusCode = 400;
      throw error;
    }

    if (product.published === false) {
      const error = new Error(`Product '${product.name}' is currently unavailable for purchase`);
      error.statusCode = 400;
      throw error;
    }

    // Determine trusted price strictly from database
    const trustedPrice =
      typeof product.salePrice === "number" && product.salePrice > 0
        ? product.salePrice
        : typeof product.regularPrice === "number" && product.regularPrice > 0
        ? product.regularPrice
        : 0;

    if (!trustedPrice || trustedPrice <= 0 || !Number.isFinite(trustedPrice)) {
      const error = new Error(`Product '${product.name}' does not have a valid price configured`);
      error.statusCode = 400;
      throw error;
    }

    const originalPrice =
      typeof product.regularPrice === "number" && product.regularPrice > 0
        ? product.regularPrice
        : trustedPrice;

    populatedItems.push({
      productId: product._id,
      name: product.name,
      image: product.images?.[0]?.url || (typeof product.images?.[0] === "string" ? product.images[0] : "") || "",
      price: Math.round(trustedPrice * 100) / 100,
      regularPrice: Math.round(originalPrice * 100) / 100,
      quantity,
      sku: product.sku || product.referenceNumber || product._id.toString(),
      category: product.category || "Watch",
    });
  }

  const subtotal = Math.round(
    populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0) * 100
  ) / 100;

  const originalPriceTotal = Math.round(
    populatedItems.reduce((acc, item) => acc + item.regularPrice * item.quantity, 0) * 100
  ) / 100;

  return { populatedItems, subtotal, originalPriceTotal };
};

/**
 * Validates ownership, payment status, and integrity of an existing negotiated order.
 *
 * @param {Object} order - MongoDB Order document
 * @param {Object} requester - { userId, isAdmin, role }
 * @param {string} requestEmail - Email supplied in shipping/billing address
 */
const verifyExistingOrder = (order, requester = {}, requestEmail = "") => {
  if (!order) {
    const error = new Error("Existing order not found");
    error.statusCode = 404;
    throw error;
  }

  if (order.paymentStatus === "paid") {
    const error = new Error("This order has already been paid");
    error.statusCode = 400;
    throw error;
  }

  const isAdmin = Boolean(requester.isAdmin || requester.role);
  const isOwner = Boolean(
    requester.userId &&
    order.userId &&
    order.userId.toString() === requester.userId.toString()
  );

  const isEmailMatch = Boolean(
    requestEmail &&
    order.shippingAddress?.email &&
    requestEmail.toLowerCase().trim() === order.shippingAddress.email.toLowerCase().trim()
  );

  // If order has an owner, only owner, admin, or verified matching email can checkout
  if (order.userId && !isAdmin && !isOwner && !isEmailMatch) {
    const error = new Error("You are not authorized to checkout this order");
    error.statusCode = 403;
    throw error;
  }

  if (!Array.isArray(order.items) || order.items.length === 0) {
    const error = new Error("Existing order contains no items");
    error.statusCode = 400;
    throw error;
  }

  if (typeof order.subtotal !== "number" || order.subtotal <= 0) {
    const error = new Error("Invalid order subtotal on existing order");
    error.statusCode = 400;
    throw error;
  }

  return true;
};

module.exports = {
  validateAndPriceItems,
  verifyExistingOrder,
};
