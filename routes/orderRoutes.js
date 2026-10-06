const express = require("express");
const router = express.Router();
const { protect, adminProtect, optionalProtect } = require("../middlewares/authMiddleware");

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
  refundOrder,
  updateOrderLogistics,
  sendOrderTrackingEmail,
  sendPaymentRecoveryEmailController,
} = require("../controllers/orderController");

// ✅ Place this route BEFORE /:id
router.get("/myorders", protect, getMyOrders);

// Specific routes FIRST
router.post("/stripe/create-checkout", optionalProtect, createStripeOrder);
router.post("/calculate-shipping", optionalProtect, calculateShipping);
router.post("/:id/refund", adminProtect, refundOrder);
router.post("/:id/send-tracking-email", adminProtect, sendOrderTrackingEmail);
router.post("/:id/send-recovery-email", adminProtect, sendPaymentRecoveryEmailController);
router.post("/send-recovery-email/:id", adminProtect, sendPaymentRecoveryEmailController);

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
router.put("/:id/logistics", adminProtect, updateOrderLogistics);
router.put("/:id", adminProtect, updateOrderLogistics);
router.delete("/:id", adminProtect, deleteOrder);

// Dynamic route LAST - Protected with optionalProtect to allow owner/admin check
router.get("/:id", optionalProtect, getOrderById);

module.exports = router;
