const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { s3, BUCKET, uploadToS3 } = require("./s3Client");
const {
  validateImageFile,
  generateSafeS3Key,
  cleanupTempFiles,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
} = require("../utils/uploadSecurityHelper");

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : ".tmp";
    cb(null, `admin-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext) || !ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      return cb(new Error("Only images allowed (JPEG, PNG, WebP, GIF)"));
    }
    cb(null, true);
  },
});

// Middleware to handle optional profile upload
const uploadAdminProfile = (req, res, next) => {
  const uploader = upload.single("profile");

  uploader(req, res, async (err) => {
    if (err) {
      if (req.file) cleanupTempFiles(req.file);
      return res.status(400).json({ message: err.message });
    }

    // No file uploaded, continue
    if (!req.file) return next();

    // 1. Validate magic bytes on disk
    const check = validateImageFile(req.file, false);
    if (!check.valid) {
      cleanupTempFiles(req.file);
      return res.status(400).json({ message: check.error || "File signature validation failed" });
    }

    try {
      const s3Key = generateSafeS3Key("MontresAdminProfiles", req.file.originalname);
      const url = await uploadToS3(req.file.path, s3Key, req.file.mimetype);

      cleanupTempFiles(req.file);

      // Attach S3 URL to request body
      req.body.profileUrl = url;
      next();
    } catch (error) {
      cleanupTempFiles(req.file);
      console.error("S3 upload error:", error.message || error);
      res.status(500).json({ message: "Error uploading profile image to S3" });
    }
  });
};

module.exports = uploadAdminProfile;
