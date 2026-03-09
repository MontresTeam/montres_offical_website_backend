const express = require("express");
const router = express.Router();
const { protect, adminProtect } = require("../middlewares/authMiddleware");

const {
  createStripeOrder,
  getOrderById,
  getAllOrders,
  getMyOrders,
  getShippingAddresses,
  createShippingAddress,
  deleteShippingAddress,
  getBillingAddresses,
  createBillingAddress,
  deleteBillingAddress,
  updateBillingAddress,
  updateShippingAddress,
  calculateShipping,
  deleteOrder,
} = require("../controllers/orderController");

// ✅ Place this route BEFORE /:id
router.get("/myorders", protect, getMyOrders);

// Specific routes FIRST
router.post("/stripe/create-checkout", protect, createStripeOrder);
router.post("/calculate-shipping", protect, calculateShipping);

// Shipping
router.get("/shipping", protect, getShippingAddresses);
router.post("/shipping", protect, createShippingAddress);
router.delete("/shipping/:id", protect, deleteShippingAddress);
router.put("/shipping-address/:id", protect, updateShippingAddress)

// Billing
router.get("/billing", protect, getBillingAddresses);
router.post("/billing", protect, createBillingAddress);
router.delete("/billing/:id", protect, deleteBillingAddress);
router.put("/billing-address/:id", protect, updateBillingAddress)

router.get("/", adminProtect, getAllOrders);
router.delete("/:id", adminProtect, deleteOrder);

// Dynamic route LAST
router.get("/:id", getOrderById);

module.exports = router;
