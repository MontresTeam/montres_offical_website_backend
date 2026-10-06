const express = require("express");
const { getAllLeatherGoods, updateLeathergoods, getLeatherBags, addLeathergoods, getProductsByLeatherSubCategory, getLeatherSubcategories } = require('../controllers/leathersController');
const addProductImageUpload = require("../config/addProductImageUpload");
const updateProductImageUpload = require("../config/updateProductImageUpload");

const { adminProtect } = require("../middlewares/authMiddleware");

const router = express.Router();

// ✅ CORRECT: Category as route parameter
router.get("/category/:category", getAllLeatherGoods);

// ✅ Alternative: Support both route parameter and query parameter
router.get("/category", getAllLeatherGoods); // For query params like ?category=handbags
router.get("/subcategories/:leatherSubCategory", getProductsByLeatherSubCategory);

router.get("/subcategories", getLeatherSubcategories);
router.post("/Add", adminProtect, addProductImageUpload, addLeathergoods);
router.put('/Updateleather/:id', adminProtect, updateProductImageUpload, updateLeathergoods);
router.get('/getHandBags', getLeatherBags);

module.exports = router;