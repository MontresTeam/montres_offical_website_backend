const express = require("express");
const {
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
} = require("../controllers/offerController");
const { adminProtect, protect, optionalProtect } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public routes
router.post("/create", protect, createOffer); // POST /api/offers/create requires user to be logged in
router.get("/verify/:token", verifyOfferToken); // GET /api/offers/verify/:token
router.get("/:id", getOfferById); // GET /api/offers/:id

// Protected Customer routes
router.post("/counter-response", optionalProtect, respondToCounterOffer); // POST /api/offers/counter-response
router.get("/user/offers", protect, getUserOffers); // GET /api/offers/user/offers

// Admin routes (Protected)
// These will be mounted as /api/admin/offers in server.js
const adminRouter = express.Router();
adminRouter.use(adminProtect);

adminRouter.get("/", getOffers); // GET /api/admin/offers
adminRouter.post("/accept", acceptOffer); // POST /api/admin/offers/accept
adminRouter.post("/reject", rejectOffer); // POST /api/admin/offers/reject
adminRouter.post("/counter", counterOffer); // POST /api/admin/offers/counter
adminRouter.delete("/:id", deleteOffer); // DELETE /api/admin/offers/:id

module.exports = {
    offerRouter: router,
    adminOfferRouter: adminRouter
};
