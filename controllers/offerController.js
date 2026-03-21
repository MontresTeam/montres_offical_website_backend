const CustomerNotification = require("../models/CustomerNotification");
const AdminNotification = require("../models/AdminNotification");
const { createCustomerNotification, createAdminNotification } = require("../utils/notificationHelper");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Offer = require("../models/OfferModel");
const Product = require("../models/product");
const User = require("../models/UserModel");
const Order = require("../models/OrderModel");
const {

    sendOfferConfirmationEmail,
    sendOfferStatusUpdateEmail,
    sendAdminOfferNotification,
    sendCounterOfferEmail,
    sendOfferExpiredEmail
} = require("../services/emailService");

// Generate a unique token
const generateOfferToken = () => {
    return crypto.randomBytes(16).toString("hex");
};

// @desc    Submit a new offer (Customer side)
// @route   POST /api/offers/submit
const createOffer = async (req, res) => {
    try {
        const {
            product: productId,
            productName,
            customerName,
            customerEmail,
            originalPrice,
            offerPrice,
            message,
        } = req.body;
        const userId = req.user?.userId;

        if (!productId || !offerPrice || !originalPrice) {
            return res.status(400).json({ message: "Product and price information are required." });
        }

        // 0. Fetch user info if logged in
        let dbUser = null;
        let finalCustomerName = customerName;
        let finalCustomerEmail = customerEmail;

        if (userId) {
            dbUser = await User.findById(userId);
            if (dbUser) {
                finalCustomerName = dbUser.name;
                finalCustomerEmail = dbUser.email;
            }
        }

        if (!finalCustomerEmail) {
            return res.status(400).json({ message: "Customer email is required. Please ensure you are logged in." });
        }

        // 1. Validate product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        // 2. Check if make offer is enabled
        if (!product.make_offer_enabled) {
            return res.status(400).json({ message: "Make offer is not enabled for this product." });
        }

        // 3. Validate minimum offer
        let minAllowedPrice = 0;
        let errorMessage = "";

        if (product.minimum_offer_type === "amount") {
            minAllowedPrice = product.minimum_offer_amount || 0;
            errorMessage = `Offer too low. Minimum allowed is AED ${minAllowedPrice.toLocaleString()}.`;
        } else {
            const minOfferPercent = product.minimum_offer_percentage || 80;
            minAllowedPrice = (originalPrice * minOfferPercent) / 100;
            errorMessage = `Offer too low. Minimum allowed is AED ${minAllowedPrice.toLocaleString()} (${minOfferPercent}% of price).`;
        }

        if (offerPrice < minAllowedPrice) {
            return res.status(400).json({ message: errorMessage });
        }

        const token = generateOfferToken();
        const expiresAt = new Date();
        const expHours = product.offer_expiration_time || 48;
        expiresAt.setHours(expiresAt.getHours() + expHours); // Custom or 48 hours expiry

        const offerPercentage = (offerPrice / originalPrice) * 100;

        const offerData = {
            product: productId,
            productName: productName || product.name,
            customerName: finalCustomerName || "Guest",
            customerEmail: finalCustomerEmail,
            originalPrice,
            offerPrice,
            offerPercentage,
            message,
            token,
            expiresAt,
            user: userId || null,
            status: "pending"
        };

        const newOffer = new Offer(offerData);
        let savedOffer = await newOffer.save();

        // 4. Auto Counter Logic (Storage only - keep as pending for customer)
        // We calculate counterPrice for admin suggestion, but keep status as pending
        // REMOVED storage to counterPrice to avoid showing wrong 'Final Price' in frontend
        /*
        if (product.auto_counter_offer_threshold && offerPercentage < product.auto_counter_offer_threshold) {
             const counterPriceSuggestion = (originalPrice * product.auto_counter_offer_threshold) / 100;
             savedOffer.counterPrice = counterPriceSuggestion;
             await savedOffer.save();
        }
        */

        // 5. Notifications
        // A) Admin: New Offer Submitted
        await createAdminNotification(req.app, {
            message: `New Offer Received: Customer submitted ${offerPrice} AED for ${productName || product.name}.`,
            type: "offer_submitted",
            offerId: savedOffer._id,
            actionLink: `/offers/${savedOffer._id}`
        });

        // Customer: Offer Submitted Confirmation ONLY
        // NOTE: No counter offer notification here even if auto-countered.
        // "Counter Offer Received" only fires when admin manually sends a counter.
        if (userId) {
            await createCustomerNotification(req.app, {
                userId,
                message: "Your offer has been submitted successfully. You will be notified once the seller responds.",
                type: "offer_submitted",
                offerId: savedOffer._id,
            });
        }

        // Email to Admin — always send as "pending" (New Offer) regardless of auto-counter status
        try {
            await sendAdminOfferNotification({
                productName: productName || product.name,
                customerName: finalCustomerName || "Guest",
                customerEmail: finalCustomerEmail,
                offerPrice,
                originalPrice,
                status: "pending" // Always show as New Offer on initial submission
            });
        } catch (err) {
            console.error("Admin Email Notify Failed:", err);
        }

        // Email to Customer — always send offer confirmation on submission
        // Auto-counter is an internal action; customer should NOT receive a counter offer email immediately.
        // Counter offer email is only sent when admin manually triggers it.
        try {
            await sendOfferConfirmationEmail(savedOffer);
        } catch (emailError) {
            console.error("Failed to send customer email:", emailError);
        }

        res.status(201).json({
            success: true,
            message: "Your offer has been successfully submitted.",
            data: savedOffer,
        });
    } catch (error) {
        console.error("Create offer error:", error);
        res.status(500).json({ success: false, message: "Error submitting offer", error: error.message });
    }
};

// @desc    Accept an offer
// @route   POST /api/offers/accept/:id
const acceptOffer = async (req, res) => {
    try {
        const { id } = req.body;
        const offer = await Offer.findById(id).populate("product");

        if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
        }

        offer.status = "accepted";
        offer.counterPrice = null; // Reset counter price as we are accepting the current bid
        await offer.save();

        // Create Order automatically
        let savedOrder = null;
        try {
            const newOrder = new Order({
                userId: offer.user,
                items: [{
                    productId: offer.product._id,
                    name: offer.productName,
                    price: offer.offerPrice,
                    quantity: 1,
                    image: offer.product.images?.[0]?.url || ""
                }],
                subtotal: offer.offerPrice,
                originalPrice: offer.originalPrice,
                total: offer.offerPrice,
                paymentMethod: "stripe", // Placeholder
                paymentStatus: "pending",
                currency: "AED",
                shippingAddress: {
                    firstName: offer.customerName.split(' ')[0],
                    lastName: offer.customerName.split(' ')[1] || "",
                    email: offer.customerEmail,
                }
            });
            savedOrder = await newOrder.save();
            offer.order = savedOrder._id;
            await offer.save();
        } catch (err) {
            console.error("Auto-order creation failed:", err);
        }

        // 1. Notification to Customer: Offer Accepted
        if (offer.user) {
            await createCustomerNotification(req.app, {
                userId: offer.user,
                message: "Offer Accepted 🎉 Your offer has been accepted. Proceed to checkout.",
                type: "offer_accepted",
                offerId: offer._id,
            });
        }

        // 2. Email to Customer only — admin is the one who accepted, so no self-notification needed
        try {
            await sendOfferStatusUpdateEmail(offer, "accepted", savedOrder?._id);
        } catch (err) {
            console.error("Customer Acceptance Email Failed:", err);
        }

        res.status(200).json({
            success: true,
            message: "Offer accepted successfully and order created.",
            data: offer,
            orderId: savedOrder?._id
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error accepting offer", error: error.message });
    }
};

// @desc    Reject an offer
// @route   POST /api/offers/reject/:id
const rejectOffer = async (req, res) => {
    try {
        const { id } = req.body;
        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
        }

        offer.status = "rejected";
        await offer.save();

        // Notification to Customer: Offer Rejected
        if (offer.user) {
            await createCustomerNotification(req.app, {
                userId: offer.user,
                message: "Offer Rejected. The seller did not accept your offer. You may submit a new offer.",
                type: "offer_rejected",
                offerId: offer._id,
            });
        }
        // Email to Customer
        try {
            await sendOfferStatusUpdateEmail(offer, "rejected");
        } catch (err) {
            console.error("Rejection Email Failed:", err);
        }

        res.status(200).json({
            success: true,
            message: "Offer rejected successfully",
            data: offer,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error rejecting offer", error: error.message });
    }
};

// @desc    Send a counter offer
// @route   POST /api/offers/counter/:id
const counterOffer = async (req, res) => {
    try {
        const { id, counterPrice, expirationHours } = req.body;

        if (!counterPrice) {
            return res.status(400).json({ message: "Counter price is required" });
        }

        const offer = await Offer.findById(id);
        if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
        }

        const expHours = expirationHours || 24;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(expHours));

        offer.status = "countered";
        offer.counterPrice = counterPrice;
        offer.expiresAt = expiresAt;
        await offer.save();

        // Notification to Customer
        if (offer.user) {
            await createCustomerNotification(req.app, {
                userId: offer.user,
                message: "Counter Offer Received. The seller has sent you a new offer. Please review and respond.",
                type: "counter_offer",
                offerId: offer._id,
            });
        }

        // Notification to Admin: Counter Offer Sent
        await createAdminNotification(req.app, {
            message: `Counter Offer Sent: You sent ${counterPrice} AED counter offer.`,
            type: "counter_offer_sent",
            offerId: offer._id,
            actionLink: `/offers/${offer._id}`
        });
        // Email to Customer
        try {
            const expHoursValue = parseInt(expHours);
            await sendCounterOfferEmail(offer, counterPrice, expHoursValue);
        } catch (err) {
            console.error("Counter Email Failed:", err);
        }

        res.status(200).json({
            success: true,
            message: "Counter offer sent successfully",
            data: offer,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error sending counter offer", error: error.message });
    }
};

// Get all offers (Admin Only)
const getOffers = async (req, res) => {
    try {
        // Automatically mark expired offers
        const now = new Date();
        const expiredOffers = await Offer.find({
            status: { $in: ["pending", "countered"] },
            expiresAt: { $lt: now }
        });

        if (expiredOffers.length > 0) {
            for (const offer of expiredOffers) {
                offer.status = "expired";
                await offer.save();

                // Notify Customer: Offer Expired
                if (offer.user) {
                    await createCustomerNotification(req.app, {
                        userId: offer.user,
                        message: "Offer Expired. Your offer has expired without a response.",
                        type: "offer_expired",
                        offerId: offer._id,
                    });
                }

                // Email Customer: Offer Expired
                try {
                    await sendOfferExpiredEmail(offer);
                } catch (err) {
                    console.error("Expired Email Failed:", err);
                }
            }
        }

        const { status, productId } = req.query;
        const filter = {};

        if (status && status !== "all") {
            filter.status = status;
        }

        if (productId) {
            if (mongoose.Types.ObjectId.isValid(productId)) {
                filter.product = productId;
            }
        }

        const offers = await Offer.find(filter)
            .populate("product", "brand model name sku images salePrice regularPrice make_offer_enabled minimum_offer_percentage acceptance_probability_rules")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: offers.length,
            data: offers,
        });
    } catch (error) {
        console.error("Get offers error:", error);
        res.status(500).json({ success: false, message: "Error fetching offers", error: error.message });
    }
};

// Delete offer (Admin Only)
const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedOffer = await Offer.findByIdAndDelete(id);

        if (!deletedOffer) {
            return res.status(404).json({ message: "Offer not found" });
        }

        res.status(200).json({
            success: true,
            message: "Offer deleted successfully",
        });
    } catch (error) {
        console.error("Delete offer error:", error);
        res.status(500).json({ success: false, message: "Error deleting offer", error: error.message });
    }
};

// Verify offer by token (Public)
const verifyOfferToken = async (req, res) => {
    try {
        const { token } = req.params;
        const offer = await Offer.findOne({ token }).populate("product").populate("order");

        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found or already used." });
        }

        if (offer.status === "expired" || (offer.expiresAt && new Date() > offer.expiresAt)) {
            offer.status = "expired";
            await offer.save();

            // Send expiration email if not already notified
            try {
                await sendOfferExpiredEmail(offer);
            } catch (err) {
                console.error("Link Expiry Email Failed:", err);
            }

            return res.status(400).json({ success: false, message: "This offer has expired." });
        }

        res.status(200).json({
            success: true,
            data: offer,
        });
    } catch (error) {
        console.error("Verify offer token error:", error);
        res.status(500).json({ success: false, message: "Error verifying offer link", error: error.message });
    }
};

// @desc    Accept/Reject counter offer (Customer side)
// @route   POST /api/offers/counter-response
const respondToCounterOffer = async (req, res) => {
    try {
        const { offerId, action, newOfferAmount } = req.body;
        const offer = await Offer.findById(offerId).populate("product");

        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        if (action === "accept") {
            offer.status = "accepted";
            await offer.save();

            // Create Order automatically at accepted price
            // Note: Since we don't have shipping info yet, we create a specialized 'offer-order'
            // or just prepare the order and redirect.
            // Following requirement: "Create order automatically"

            const acceptedPrice = offer.counterPrice || offer.offerPrice;

            const newOrder = new Order({
                userId: offer.user || req.user?.userId,
                items: [{
                    productId: offer.product._id,
                    name: offer.productName,
                    price: acceptedPrice,
                    quantity: 1,
                    image: offer.product.images?.[0]?.url || ""
                }],
                subtotal: acceptedPrice,
                originalPrice: offer.originalPrice,
                total: acceptedPrice,
                paymentMethod: "stripe", // Default placeholder
                paymentStatus: "pending",
                currency: "AED",
                shippingAddress: {
                    firstName: offer.customerName.split(' ')[0],
                    lastName: offer.customerName.split(' ')[1] || "",
                    email: offer.customerEmail,
                }
            });

            const savedOrder = await newOrder.save();
            offer.order = savedOrder._id;
            await offer.save();

            // Notification to Admin: Counter Offer Accepted
            await createAdminNotification(req.app, {
                message: "Offer Accepted 🎉 Customer accepted your counter offer.",
                type: "counter_offer_accepted",
                offerId: offer._id,
                actionLink: `/admin/orders/${savedOrder._id}`
            });

            // Email Admin — counter offer accepted by customer
            try {
                await sendAdminOfferNotification({
                    productName: offer.productName,
                    customerName: offer.customerName,
                    customerEmail: offer.customerEmail,
                    offerPrice: acceptedPrice,
                    originalPrice: offer.originalPrice,
                    status: "COUNTER_OFFER_ACCEPTED",
                    orderId: savedOrder._id
                });
            } catch (err) {
                console.error("Notify Admin Counter Acceptance Error:", err);
            }

            // Email Customer — confirm their counter offer acceptance
            try {
                await sendOfferStatusUpdateEmail(offer, "accepted", savedOrder._id);
            } catch (err) {
                console.error("Customer Counter Acceptance Email Failed:", err);
            }

            return res.status(200).json({
                success: true,
                message: "Counter offer accepted!",
                orderId: savedOrder._id,
                redirectUrl: `/checkout?orderId=${savedOrder._id}&offerToken=${offer.token}`
            });

        } else if (action === "reject") {
            offer.status = "rejected";
            await offer.save();

            // Notification to Admin: Counter Offer Rejected
            await createAdminNotification(req.app, {
                message: `Counter Offer Rejected: Customer declined your ${offer.counterPrice ? offer.counterPrice + ' AED' : 'offer'}.`,
                type: "counter_offer_rejected",
                offerId: offer._id,
                actionLink: `/offers/${offer._id}`
            });

            // Email Admin — counter offer rejected by customer
            try {
                await sendAdminOfferNotification({
                    productName: offer.productName,
                    customerName: offer.customerName,
                    customerEmail: offer.customerEmail,
                    offerPrice: offer.counterPrice || offer.offerPrice,
                    originalPrice: offer.originalPrice,
                    status: "COUNTER_OFFER_REJECTED"
                });
            } catch (err) {
                console.error("Notify Admin Counter Rejection Error:", err);
            }

            return res.status(200).json({
                success: true,
                message: "Counter offer rejected."
            });

        } else if (action === "new_offer") {
            // Logic for submitting a new offer from the counter modal
            // We'll reuse parts of createOffer logic
            offer.status = "rejected"; // Close old offer
            await offer.save();

            // The frontend will usually just call /api/offers/create again,
            // but we can handle it here if preferred. 
            // For simplicity, we'll tell the frontend to re-submit.
            return res.status(200).json({
                success: true,
                message: "Previous offer closed. Please submit your new offer.",
                shouldResubmit: true
            });
        }

        res.status(400).json({ success: false, message: "Invalid action" });
    } catch (error) {
        console.error("Counter response error:", error);
        res.status(500).json({ success: false, message: "Error responding to counter", error: error.message });
    }
};

// @desc    Get user's offer history
// @route   GET /api/offers/user
const getUserOffers = async (req, res) => {
    try {
        const userId = req.user?.userId || req.query.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User identification required" });
        }

        const offers = await Offer.find({ user: userId })
            .populate("product")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: offers
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching user offers", error: error.message });
    }
};

// @desc    Get offer details by ID
// @route   GET /api/offers/:id
const getOfferById = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id).populate("product");
        if (!offer) {
            return res.status(404).json({ success: false, message: "Offer not found" });
        }

        res.status(200).json({
            success: true,
            data: offer
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching offer", error: error.message });
    }
};

module.exports = {
    createOffer,
    getOffers,
    acceptOffer,
    rejectOffer,
    counterOffer,
    deleteOffer,
    verifyOfferToken,
    respondToCounterOffer,
    getUserOffers,
    getOfferById,
};
