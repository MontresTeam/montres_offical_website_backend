const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes.test(ext)) return cb(new Error("Only images allowed"));
    cb(null, true);
  },
  // removed the fileSize limit
});

const imageUploadUpdate = (req, res, next) => {
  upload.single("profilePicture")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      // 1. Handle file upload (multipart/form-data)
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "MontresTradingLLC/ProfileImages",
          resource_type: "image",
          transformation: [
            { width: 600, height: 600, crop: "limit" },
            { quality: "auto", fetch_format: "auto" },
          ],
        });

        req.body.profilePicture = result.secure_url;
        fs.unlink(req.file.path, () => { }); // delete temp file
      }
      // 2. Handle base64 string (application/json)
      else if (req.body.profilePicture && req.body.profilePicture.startsWith("data:image/")) {
        const result = await cloudinary.uploader.upload(req.body.profilePicture, {
          folder: "MontresTradingLLC/ProfileImages",
          resource_type: "image",
          transformation: [
            { width: 600, height: 600, crop: "limit" },
            { quality: "auto", fetch_format: "auto" },
          ],
        });

        req.body.profilePicture = result.secure_url;
      }

      next();
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      return res.status(500).json({ message: "Error uploading image", error: error.message });
    }
  });
};

module.exports = imageUploadUpdate;
