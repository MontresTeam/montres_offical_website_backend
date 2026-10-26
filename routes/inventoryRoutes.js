const express = require("express");
const router = express.Router();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
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
const { cleanupTempFiles } = require("../utils/uploadSecurityHelper");

// Ensure upload folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".csv", ".xlsx"].includes(ext) ? ext : ".tmp";
    cb(null, `inv-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for spreadsheets
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    if (ext === ".xls") {
      return cb(new Error("Unsupported format '.xls'. Please upload modern '.xlsx' or '.csv'"));
    }

    const allowedExts = [".csv", ".xlsx"];
    const allowedMimes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "application/csv",
      "text/x-csv",
      "application/octet-stream",
    ];

    if (!allowedExts.includes(ext) || !allowedMimes.includes(mime)) {
      return cb(new Error(`Unsupported file type '${ext}'. Allowed: .csv, .xlsx`));
    }

    cb(null, true);
  },
});

// Middleware wrapper to catch Multer errors (e.g. fileSize limit, unexpected file)
const inventoryUploadMiddleware = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (req.file) cleanupTempFiles(req.file);
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

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
router.post("/import", inventoryUploadMiddleware, importInventory);
router.get("/export", exportInventory);

module.exports = router;
