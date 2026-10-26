const express = require("express");
const router = express.Router();
const {
    getPurchases,
    createPurchase,
    updatePurchase,
    deletePurchase,
} = require("../controllers/purchaseController");

const { adminProtect } = require("../middlewares/authMiddleware");

// Apply adminProtect to all routes in this router
router.use(adminProtect);

router.get("/getPurchase", getPurchases);
router.post("/", createPurchase);
router.put("/:id", updatePurchase);
router.delete("/:id", deletePurchase);

module.exports = router;
