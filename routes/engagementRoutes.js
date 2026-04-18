const express = require("express");
const router = express.Router();
const {
  incrementViews,
  toggleWatch,
  getWatchStatus,
  sendOfferToWatchers,
  getMyOffers,
  respondToOffer,
} = require("../controllers/engagementController");
const { protect, adminProtect } = require("../middlewares/authMiddleware");

// Public routes
router.post("/view/:id", incrementViews);

// Protected User routes
router.post("/watch/:id", protect, toggleWatch);
router.get("/watch-status/:id", protect, getWatchStatus);
router.get("/my-offers", protect, getMyOffers);
router.post("/respond-offer/:id", protect, respondToOffer);

// Admin routes
router.post("/send-offer", adminProtect, sendOfferToWatchers);

module.exports = router;
