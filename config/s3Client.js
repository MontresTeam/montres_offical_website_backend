// config/s3Client.js
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const BUCKET = process.env.S3_BUCKET;

/**
 * Upload a file buffer to S3 and return the public URL.
 * @param {string} filePath   - Local temp file path (used to read the file)
 * @param {string} s3Key      - Destination key inside the bucket (e.g. "MontresTradingLLC/123-img.jpg")
 * @param {string} mimeType   - MIME type of the file
 * @returns {Promise<string>} - Public S3 URL
 */
const uploadToS3 = (filePath, s3Key, mimeType) => {
  const fs = require("fs");
  const fileContent = fs.readFileSync(filePath);

  const params = {
    Bucket: BUCKET,
    Key: s3Key,
    Body: fileContent,
    ContentType: mimeType,
  };

  return s3.upload(params).promise().then((data) => data.Location);
};

/**
 * Delete a file from S3 bucket.
 * @param {string} s3Key - S3 object key
 * @returns {Promise<any>}
 */
const deleteFromS3 = (s3Key) => {
  if (!s3Key) return Promise.resolve();
  const params = {
    Bucket: BUCKET,
    Key: s3Key,
  };
  return s3.deleteObject(params).promise();
};

module.exports = { s3, BUCKET, uploadToS3, deleteFromS3 };
