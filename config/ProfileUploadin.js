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

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : ".tmp";
    cb(null, `prof-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile picture
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

const imageUploadUpdate = (req, res, next) => {
  upload.single("profilePicture")(req, res, async (err) => {
    if (err) {
      if (req.file) cleanupTempFiles(req.file);
      return res.status(400).json({ error: err.message });
    }

    try {
      // 1. Handle multipart file upload
      if (req.file) {
        const check = validateImageFile(req.file, false);
        if (!check.valid) {
          cleanupTempFiles(req.file);
          return res.status(400).json({ error: check.error || "File signature validation failed" });
        }

        const s3Key = generateSafeS3Key("MontresTradingLLC/ProfileImages", req.file.originalname);
        const url = await uploadToS3(req.file.path, s3Key, req.file.mimetype);

        cleanupTempFiles(req.file);
        req.body.profilePicture = url;
      }
      // 2. Handle base64 string (application/json) — validate buffer magic bytes
      else if (req.body?.profilePicture && typeof req.body.profilePicture === "string" && req.body.profilePicture.startsWith("data:image/")) {
        const base64Data = req.body.profilePicture.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ error: "Profile picture exceeds maximum allowed size (5MB)" });
        }

        const mimeMatch = req.body.profilePicture.match(/data:(image\/\w+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "image/jpeg";

        if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
          return res.status(400).json({ error: `Unsupported image format: ${mimeType}` });
        }

        // Validate buffer magic bytes
        let isValidMagic = false;
        if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) isValidMagic = true; // JPEG
        else if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) isValidMagic = true; // PNG
        else if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8") isValidMagic = true; // GIF
        else if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") isValidMagic = true; // WEBP

        if (!isValidMagic) {
          return res.status(400).json({ error: "Invalid image signature in base64 payload" });
        }

        const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
        const ext = extMap[mimeType] || "jpg";
        const s3Key = `MontresTradingLLC/ProfileImages/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-profile.${ext}`;

        const result = await s3
          .upload({
            Bucket: BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: mimeType,
          })
          .promise();

        req.body.profilePicture = result.Location;
      }

      next();
    } catch (error) {
      if (req.file) cleanupTempFiles(req.file);
      console.error("S3 upload error:", error.message || error);
      return res.status(500).json({ message: "Error uploading image", error: error.message });
    }
  });
};

module.exports = imageUploadUpdate;
