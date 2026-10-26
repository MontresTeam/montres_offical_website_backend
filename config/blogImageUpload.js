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
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
} = require("../utils/uploadSecurityHelper");

// Ensure upload folder exists
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
    cb(null, `blog-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext) || !ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      return cb(new Error(`Unsupported image format '${ext}'. Allowed: JPEG, PNG, WebP, GIF`));
    }

    cb(null, true);
  },
});

const uploader = upload.fields([{ name: "featuredImage", maxCount: 1 }]);

const blogImageUpload = (req, res, next) => {
  uploader(req, res, async (err) => {
    const file = req.files?.featuredImage?.[0];

    if (err) {
      if (file) cleanupTempFiles(file);
      return res.status(400).json({ message: err.message });
    }

    if (!file) {
      req.body.images = req.body.images || [];
      return next();
    }

    // 1. Validate magic bytes on disk
    const check = validateImageFile(file, false);
    if (!check.valid) {
      cleanupTempFiles(file);
      return res.status(400).json({ message: check.error || "File signature validation failed" });
    }

    const uploadedS3Keys = [];

    try {
      const s3Key = generateSafeS3Key("MontresBlogs", file.originalname);
      const url = await uploadToS3(file.path, s3Key, file.mimetype);
      uploadedS3Keys.push(s3Key);

      cleanupTempFiles(file);

      req.body.images = [{
        url,
        type: "featured",
        alt: sanitizeFilename(file.originalname),
      }];

      next();
    } catch (error) {
      console.error("❌ S3 upload error:", error.message || error);
      cleanupTempFiles(file);
      await rollbackS3Uploads(s3, BUCKET, uploadedS3Keys);
      return res.status(500).json({ message: "Error uploading images to S3", error: error.message });
    }
  });
};

module.exports = blogImageUpload;
