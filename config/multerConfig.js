const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { s3, BUCKET, uploadToS3 } = require("./s3Client");
const {
  validateImageFile,
  sanitizeFilename,
  generateSafeS3Key,
  cleanupTempFiles,
  rollbackS3Uploads,
} = require("../utils/uploadSecurityHelper");

// Ensure upload folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage with unpredictable local temp filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"].includes(ext) ? ext : ".tmp";
    const unique = `upload-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`;
    cb(null, unique);
  },
});

const ALLOWED_FIELDS = new Set(["images", "image", "attachment", "photos", "file"]);

// Restrict upload.any() by filtering fields and enforcing file size
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10,                   // max 10 files
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_FIELDS.has(file.fieldname)) {
      const err = new Error(`Unexpected field '${file.fieldname}'. Allowed: ${Array.from(ALLOWED_FIELDS).join(", ")}`);
      err.code = "LIMIT_UNEXPECTED_FILE";
      return cb(err);
    }

    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"];
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"];

    if (!allowedExts.includes(ext) || !allowedMimes.includes(mime)) {
      return cb(new Error(`Unsupported file format '${ext}'. Allowed: JPEG, PNG, WebP, GIF, PDF`));
    }

    cb(null, true);
  },
});

const imageUpload = (req, res, next) => {
  upload.any()(req, res, async (err) => {
    if (err) {
      cleanupTempFiles(req.files);
      const isLimit = err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT";
      return res.status(400).json({
        success: false,
        error: isLimit ? `Upload limit error: ${err.message}` : err.message
      });
    }

    // If no files uploaded, proceed
    if (!req.files || req.files.length === 0) {
      req.body.images = req.body.images || [];
      return next();
    }

    // 1. Validate magic bytes for all files
    for (const file of req.files) {
      const check = validateImageFile(file, true);
      if (!check.valid) {
        cleanupTempFiles(req.files);
        return res.status(400).json({
          success: false,
          error: check.error || "File signature validation failed"
        });
      }
    }

    // 2. Upload to S3 with rollback on error
    const uploadedImages = [];
    const uploadedS3Keys = [];

    try {
      for (const file of req.files) {
        const s3Key = generateSafeS3Key("MontresTradingLLC", file.originalname);
        const url = await uploadToS3(file.path, s3Key, file.mimetype);

        uploadedS3Keys.push(s3Key);
        uploadedImages.push({
          url,
          alt: sanitizeFilename(file.originalname),
        });
      }

      // Cleanup local temp files on success
      cleanupTempFiles(req.files);

      req.body.images = uploadedImages;
      next();
    } catch (uploadError) {
      console.error("S3 upload error:", uploadError.message || uploadError);
      // Clean up temp files
      cleanupTempFiles(req.files);
      // Rollback uploaded S3 files to prevent orphan objects
      await rollbackS3Uploads(s3, BUCKET, uploadedS3Keys);

      return res.status(500).json({
        success: false,
        message: "Error uploading files to S3"
      });
    }
  });
};

module.exports = imageUpload;
