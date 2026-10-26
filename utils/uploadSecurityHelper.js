const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Allowed image formats
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Allowed document formats (for contact forms)
const ALLOWED_DOC_EXTENSIONS = new Set([".pdf"]);
const ALLOWED_DOC_MIME_TYPES = new Set(["application/pdf"]);

// Allowed spreadsheet formats (for inventory import)
const ALLOWED_SPREADSHEET_EXTENSIONS = new Set([".csv", ".xlsx"]);
const ALLOWED_SPREADSHEET_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/csv",
  "text/x-csv",
  "application/octet-stream",
]);

/**
 * Inspect file magic bytes on disk and determine its real MIME type.
 *
 * @param {string} filePath - Local absolute path to the uploaded file
 * @returns {string} - Detected MIME type or "unknown"
 */
function detectFileSignature(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "unknown";

  const buffer = Buffer.alloc(32);
  let bytesRead = 0;
  const fd = fs.openSync(filePath, "r");
  try {
    bytesRead = fs.readSync(fd, buffer, 0, 32, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (bytesRead < 4) {
    // Check if it's a tiny valid text/csv
    return bytesRead > 0 ? "text/csv" : "empty";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // GIF: GIF8
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return "image/gif";
  }

  // WEBP: RIFF ... WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  // PDF: %PDF
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }

  // XLSX (Zip archive): 50 4B 03 04 or 50 4B 05 06 / 07 08
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  // XLS (CFB binary): D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return "application/vnd.ms-excel";
  }

  // Check if it's printable text/CSV without binary null bytes or control characters
  let isText = true;
  for (let i = 0; i < bytesRead; i++) {
    const byte = buffer[i];
    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      isText = false;
      break;
    }
  }

  if (isText) {
    return "text/csv";
  }

  return "unknown";
}

/**
 * Validates that an image file matches allowed extensions, declared MIME type, and magic bytes.
 *
 * @param {Object} file - Multer file object
 * @param {boolean} allowPdf - Whether PDF documents are permitted (e.g. contact form)
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateImageFile(file, allowPdf = false) {
  if (!file || !file.path) {
    return { valid: false, error: "Missing file" };
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  const isImageExt = ALLOWED_IMAGE_EXTENSIONS.has(ext);
  const isDocExt = allowPdf && ALLOWED_DOC_EXTENSIONS.has(ext);

  if (!isImageExt && !isDocExt) {
    return {
      valid: false,
      error: `Unsupported file extension '${ext}'. Allowed: ${Array.from(ALLOWED_IMAGE_EXTENSIONS).join(", ")}${allowPdf ? ", .pdf" : ""}`
    };
  }

  const declaredMime = (file.mimetype || "").toLowerCase();
  const isImageMime = ALLOWED_IMAGE_MIME_TYPES.has(declaredMime);
  const isDocMime = allowPdf && ALLOWED_DOC_MIME_TYPES.has(declaredMime);

  if (!isImageMime && !isDocMime) {
    return {
      valid: false,
      error: `Unsupported MIME type '${declaredMime}'.`
    };
  }

  // Verify magic bytes
  const detectedMime = detectFileSignature(file.path);
  if (detectedMime === "unknown" || detectedMime === "empty") {
    return {
      valid: false,
      error: "Invalid file content or signature mismatch."
    };
  }

  // Cross-check extension and detected signature
  if (ext === ".jpg" || ext === ".jpeg") {
    if (detectedMime !== "image/jpeg") return { valid: false, error: "File signature does not match JPEG format." };
  } else if (ext === ".png") {
    if (detectedMime !== "image/png") return { valid: false, error: "File signature does not match PNG format." };
  } else if (ext === ".webp") {
    if (detectedMime !== "image/webp") return { valid: false, error: "File signature does not match WebP format." };
  } else if (ext === ".gif") {
    if (detectedMime !== "image/gif") return { valid: false, error: "File signature does not match GIF format." };
  } else if (ext === ".pdf" && allowPdf) {
    if (detectedMime !== "application/pdf") return { valid: false, error: "File signature does not match PDF format." };
  }

  return { valid: true, error: null };
}

/**
 * Validates a spreadsheet file for inventory import.
 *
 * @param {Object} file - Multer file object
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateSpreadsheetFile(file) {
  if (!file || !file.path) {
    return { valid: false, error: "No file uploaded" };
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".xls") {
    return {
      valid: false,
      error: "Unsupported format '.xls'. Please save your spreadsheet as modern Excel (.xlsx) or CSV (.csv) before uploading."
    };
  }

  if (!ALLOWED_SPREADSHEET_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported spreadsheet extension '${ext}'. Allowed: .csv, .xlsx`
    };
  }

  const detected = detectFileSignature(file.path);

  if (ext === ".csv") {
    if (detected !== "text/csv") {
      return { valid: false, error: "File signature mismatch: expected valid CSV text content." };
    }
  } else if (ext === ".xlsx") {
    if (detected !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      return { valid: false, error: "File signature mismatch: expected valid XLSX spreadsheet." };
    }
  }

  return { valid: true, error: null };
}

/**
 * Sanitizes original filename to prevent path traversal, control character injection, or command injection.
 *
 * @param {string} originalName
 * @returns {string}
 */
function sanitizeFilename(originalName) {
  if (!originalName || typeof originalName !== "string") return "file";
  let clean = originalName.replace(/\0/g, "").replace(/[\x00-\x1F\x7F]/g, "");
  clean = clean.replace(/(\.\.[\/\\])+/g, "").replace(/[\/\\]+/g, "");
  const ext = path.extname(clean).toLowerCase();
  const base = path.basename(clean, ext).replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 60);
  return `${base || "file"}${ext}`;
}

/**
 * Generates an unpredictable, safe S3 destination key.
 *
 * @param {string} folder
 * @param {string} originalName
 * @returns {string}
 */
function generateSafeS3Key(folder, originalName) {
  const safeName = sanitizeFilename(originalName);
  const ext = path.extname(safeName).toLowerCase();
  const base = path.basename(safeName, ext).substring(0, 40);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  return `${folder}/${Date.now()}-${randomSuffix}-${base}${ext}`;
}

/**
 * Safely removes a list of temporary files from disk.
 *
 * @param {Array|Object|string} files
 */
function cleanupTempFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const item of list) {
    if (!item) continue;
    const filePath = typeof item === "string" ? item : item.path;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // Safe ignore
      }
    }
  }
}

/**
 * Deletes uploaded S3 keys on partial or full upload failure to prevent orphan files.
 *
 * @param {Object} s3Client
 * @param {string} bucket
 * @param {Array<string>} keys
 */
async function rollbackS3Uploads(s3Client, bucket, keys = []) {
  if (!s3Client || !bucket || !Array.isArray(keys) || keys.length === 0) return;
  for (const key of keys) {
    try {
      await s3Client.deleteObject({ Bucket: bucket, Key: key }).promise();
    } catch (err) {
      console.warn(`Failed to rollback S3 key ${key}:`, err.message);
    }
  }
}

module.exports = {
  detectFileSignature,
  validateImageFile,
  validateSpreadsheetFile,
  sanitizeFilename,
  generateSafeS3Key,
  cleanupTempFiles,
  rollbackS3Uploads,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_SPREADSHEET_EXTENSIONS,
  ALLOWED_SPREADSHEET_MIME_TYPES,
};
