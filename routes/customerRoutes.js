const express = require("express");
const router = express.Router();
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require("../controllers/customerController");

const { adminProtect } = require("../middlewares/authMiddleware");

// Apply adminProtect to all routes in this router
router.use(adminProtect);

// Routes
router.post("/create", createCustomer); // Create user
router.get("/All", getAllCustomers); // Get all users
router.get("/All/:id", getCustomerById); // Support alias
router.get("/:id", getCustomerById); // Get user by ID
router.put("/:id", updateCustomer); // Update user
router.delete("/:id", deleteCustomer); // Delete user

module.exports = router;
