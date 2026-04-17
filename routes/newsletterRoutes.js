const express = require("express");
const router = express.Router();
const newsletterController = require("../controllers/newsletterController");
const { adminProtect } = require("../middlewares/authMiddleware");

// @route   POST /api/newsletter/subscribe
// @desc    Subscribe a user to the Klaviyo newsletter list
// @access  Public
router.post("/subscribe", newsletterController.subscribeToNewsletter);

// @route   GET /api/newsletter
// @desc    Get all newsletter subscribers
// @access  Private (Admin)
router.get("/", adminProtect, newsletterController.getAllSubscribers);

// @route   DELETE /api/newsletter/:id
// @desc    Delete a newsletter subscriber
// @access  Private (Admin)
router.delete("/:id", adminProtect, newsletterController.deleteSubscriber);

module.exports = router;

