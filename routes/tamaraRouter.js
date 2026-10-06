const express = require("express");
const router = express.Router();
const { optionalProtect } = require("../middlewares/authMiddleware");
const { createTamaraOrder, getTamaraPaymentTypes } = require("../controllers/tamaraController");

router.post("/create-checkout", optionalProtect, createTamaraOrder);
router.get("/payment-types", getTamaraPaymentTypes);
router.post("/payment-types", getTamaraPaymentTypes);

module.exports = router;