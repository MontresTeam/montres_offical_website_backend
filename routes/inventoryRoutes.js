const express = require("express");
const router = express.Router();
const {
  getInventory,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
  importInventory,
  exportInventory,
  getMonthlySalesReport,
  getInventoryMonthEndReports,
  calculateInventoryMonthEnd,
} = require("../controllers/csvController");
const { adminProtect } = require("../middlewares/authMiddleware");
const multer = require("multer")
const upload = multer({ dest: "uploads/" }); // temp folder

// Apply adminProtect to all routes in this router
router.use(adminProtect);
router.get("/InvontryAll", getInventory);
router.get("/:id", getInventoryById);
router.post("/", createInventory);
router.put("/updated/:id", updateInventory);
router.delete("/:id", deleteInventory);
router.get("/reports/month-end", getInventoryMonthEndReports);
router.get("/reports/monthly-sales", getMonthlySalesReport);
router.post("/reports/calculate-month-end", calculateInventoryMonthEnd);
router.post("/import", upload.single("file"), importInventory);
router.get("/export", exportInventory);

module.exports = router;
