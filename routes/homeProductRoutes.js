const express = require("express");
const {
  addHomeProductsGrid,
  updateHomeProducts,
  getHomeProductsGrid,
  getBrandNewProducts,
  updateBrandNewProducts,
  updateTrustedProducts,
  getTrustedProduct,
  getWatchProducts,
} = require("../controllers/homeProuctsController");
const { adminProtect } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public Read Routes
router.get("/homeAll", getHomeProductsGrid);
router.get("/brandnew", getBrandNewProducts);
router.get("/trusted", getTrustedProduct);
router.get("/watches", getWatchProducts);

// Admin / Content Manager Protected CMS Routes
router.post("/addhomeproduct", adminProtect, addHomeProductsGrid);
router.put("/updatehomeproduct/:id", adminProtect, updateHomeProducts);
router.put("/brandnew", adminProtect, updateBrandNewProducts);
router.put("/updatetrusted", adminProtect, updateTrustedProducts);

module.exports = router;
