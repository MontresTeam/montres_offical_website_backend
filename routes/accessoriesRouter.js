// routes/accessoriesRoutes.js

const express = require("express");
const router = express.Router();

// Controllers
const {
  getAccessoriesProducts,
  createAccessory,
  updateAccessory,
  getAllAccessories,
  getProductsByAccessoriesCategory,
  getAccessoriesByCategoryAndSub,
} = require("../controllers/accessoriesController");

// Middlewares
const addProductImageUpload = require("../config/addProductImageUpload");
const updateProductImageUpload = require("../config/updateProductImageUpload");
const { adminProtect } = require("../middlewares/authMiddleware");

// ============================================
// ACCESSORIES ROUTES
// ============================================

// ✅ GET ALL ACCESSORIES (BY CATEGORY + QUERY FILTERS)
router.get("/category/:category", getAccessoriesProducts);

// ✅ CREATE ACCESSORY (WITH IMAGE UPLOAD)
router.post("/createAccessory", adminProtect, addProductImageUpload, createAccessory);

// ✅ UPDATE ACCESSORY (WITH IMAGE UPDATE)
router.put("/UpdatedAccessories/:id", adminProtect, updateProductImageUpload, updateAccessory);

router.get("/getAccessories",getAllAccessories)

// Get accessories by category / subcategory
router.get("/subcategories/:subcategory", getProductsByAccessoriesCategory);
// EXPORT ROUTER
module.exports = router;
