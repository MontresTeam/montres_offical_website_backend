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

// Multer storage with unpredictable local temp filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : ".tmp";
    cb(null, `upd-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 11,
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

// Middleware for UPDATE operations
const updateProductImageUpload = (req, res, next) => {
  const uploader = upload.fields([
    { name: "main", maxCount: 1 },
    { name: "covers", maxCount: 10 },
  ]);

  uploader(req, res, async (err) => {
    const allFiles = [];
    if (req.files?.main) allFiles.push(...req.files.main);
    if (req.files?.covers) allFiles.push(...req.files.covers);

    if (err) {
      cleanupTempFiles(allFiles);
      return res.status(400).json({ error: err.message });
    }

    // 1. Validate magic bytes on disk
    for (const file of allFiles) {
      const check = validateImageFile(file, false);
      if (!check.valid) {
        cleanupTempFiles(allFiles);
        return res.status(400).json({ error: check.error || "File signature validation failed" });
      }
    }

    const uploadedImages = [];
    const uploadedS3Keys = [];

    try {
      // Main image
      if (req.files?.main && req.files.main.length > 0) {
        const mainFile = req.files.main[0];
        const s3Key = generateSafeS3Key("MontresTradingLLC", mainFile.originalname);
        const url = await uploadToS3(mainFile.path, s3Key, mainFile.mimetype);

        uploadedS3Keys.push(s3Key);
        uploadedImages.push({
          url,
          type: "main",
          alt: sanitizeFilename(mainFile.originalname),
        });
      }

      // Cover images
      if (req.files?.covers && req.files.covers.length > 0) {
        for (const file of req.files.covers) {
          const s3Key = generateSafeS3Key("MontresTradingLLC", file.originalname);
          const url = await uploadToS3(file.path, s3Key, file.mimetype);

          uploadedS3Keys.push(s3Key);
          uploadedImages.push({
            url,
            type: "cover",
            alt: sanitizeFilename(file.originalname),
          });
        }
      }

      // Cleanup local temp files on success
      cleanupTempFiles(allFiles);

      // Only set images if new files were uploaded
      if (uploadedImages.length > 0) {
        req.body.uploadedImages = uploadedImages;
      }

      next();
    } catch (error) {
      console.error("S3 upload error:", error.message || error);
      cleanupTempFiles(allFiles);
      await rollbackS3Uploads(s3, BUCKET, uploadedS3Keys);
      return res.status(500).json({ message: "Error uploading files to S3" });
    }
  });
};

module.exports = updateProductImageUpload;