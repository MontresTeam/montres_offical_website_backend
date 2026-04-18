const express = require("express");
const {
  getProducts,
  addProduct,
  addServiceForm,
  productHome,
  getAllProductwithSearch,
  SimilarProduct,
  restockSubscribe,
  YouMayAlsoLike,
  getBrandWatches,
  getBookingService,
  moveToInventory,
  getProductById,
  getBrandBags,
  getRestockSubscribers,
  unsubscribeRestock,
  getBrandAccessories,
  getLimitedEditionProducts,
  updateBookingStatus,
  updateBooking,
  deleteBooking,
  getAllBrands,
  getAllProducts,
  getProductBySlug
} = require("../controllers/productController");
const {
  addToCart,
  removeFromCart,
  addToWishlist,
  removeFromWishlist,
  createWishlist,
  getWishlists,
  getMyOrders,
  Emptywishlist,
  Setdefaultwishlist,
  Deleteentirewishlist,
  getAllwishlist,
  togglePublicSharing,
  getCart,
  updateCart,
  recommendationsProduct,
  getWishlistCount,
  getCartCount
} = require("../controllers/userController");
const ImageUpload = require("../config/multerConfig");
const { protect, adminProtect } = require("../middlewares/authMiddleware");

const router = express.Router();

/* ----------------- Product Routes ----------------- */
router.get("/", getProducts);
router.get("/productAll", getAllProductwithSearch);
router.get("/getAllBrands", getAllBrands)                      // Fetch all products
router.post("/products", adminProtect, ImageUpload, addProduct);          // Add a new product (Admin Only)
router.post("/createBooking", ImageUpload, addServiceForm); // Create service form
router.get("/getBooking", getBookingService)
router.put("/updateBookingStatus/:id", adminProtect, updateBookingStatus);
router.put("/updateBooking/:id", adminProtect, updateBooking);
router.delete("/deleteBooking/:id", adminProtect, deleteBooking);
router.get("/getLimited", getLimitedEditionProducts);
router.get("/products/home", productHome);                 // Products for homepage
router.get('/productall', getAllProductwithSearch)
router.get("/getAllDatabaseProducts", getAllProducts);      // Fetch all products from database (no filter)
/* ----------------- Cart Routes ----------------- */
router.post("/cart/add", protect, addToCart);
router.get('/cart', protect, getCart)            // Add to cart
router.delete("/cart/remove", protect, removeFromCart);   // Remove from cart
router.put('/cart/update-cart', protect, updateCart)

/*------------------ Recommendations ----------------*/
router.get('/cart/recommendations', protect, recommendationsProduct)
router.get('/cart-count', protect, getCartCount)
/* ----------------- Wishlist Routes ----------------- */
router.post("/wishlist/add", protect, addToWishlist);       // Add to wishlist
router.delete("/wishlist/remove", protect, removeFromWishlist); // Remove from wishlist
router.post("/wishlist/create", protect, createWishlist);
// Create wishlist
router.get("/wishlists", protect, getWishlists);

router.delete("/wishlists/:wishlistId/items", protect, Emptywishlist)
router.put("/wishlists/default/:wishlistId", protect, Setdefaultwishlist)

router.delete("/wishlists/:wishlistId", protect, Deleteentirewishlist)
router.get("/wishlist-count", protect, getWishlistCount);
router.get("/wishlists/getAll", protect, getAllwishlist)

router.put("/wishlists/:wishlistId/visibility", protect, togglePublicSharing)
// Get all wishlists

/* ----------------- Order Routes ----------------- */
// Place order
router.get("/orders/my", protect, getMyOrders);             // My orders

router.post("/restock/:id/subscribe", restockSubscribe)
router.get("/restock/subscribers", adminProtect, getRestockSubscribers) // Admin Only
router.delete("/restock/:id/unsubscribe", unsubscribeRestock)
// Single product by 

router.get('/brand/:brand/watches', getBrandWatches);
router.get("/brand/:brand/handbags", getBrandBags);
router.get("/brand/:brand/accessories", getBrandAccessories)

router.get("/slug/:slug", getProductBySlug);
router.get("/:id", getProductById);
/* ----------------- Simillar product ----------------- */
router.get("/:id/similar", SimilarProduct);
router.get("/:id/you-may-also-like", YouMayAlsoLike);

router.post("/inventory/move", adminProtect, moveToInventory) // Admin Only


module.exports = router;
