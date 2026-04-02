const express = require("express");
const { addHomeProductsGrid, updateHomeProducts, getHomeProductsGrid, getBrandNewProducts, updateBrandNewProducts, updateTrustedProducts, getTrustedProduct, getWatchProducts } = require("../controllers/homeProuctsController");
const router = express.Router();

router.post('/addhomeproduct',addHomeProductsGrid)
router.put('/updatehomeproduct/:id',updateHomeProducts)
router.get('/homeAll',getHomeProductsGrid)
router.get('/brandnew',getBrandNewProducts)
router.put('/brandnew',updateBrandNewProducts)
router.get('/trusted',getTrustedProduct)
router.put('/updatetrusted',updateTrustedProducts)
router.get('/watches', getWatchProducts)
module.exports = router;
