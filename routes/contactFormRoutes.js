const express = require("express");
const router = express.Router();
const {
  submitContactForm,
  getAllContacts,
  getContactById,
  deleteContact,
  replyToContact,
} = require("../controllers/contactFormController");
const imageUpload = require("../config/multerConfig");

const { adminProtect } = require("../middlewares/authMiddleware");

// Submit contact form (with S3 upload) - Public
router.post("/submit", imageUpload, submitContactForm);

// Admin protected routes
router.get("/", adminProtect, getAllContacts);
router.get("/:id", adminProtect, getContactById);
router.delete("/:id", adminProtect, deleteContact);

// Reply to contact / ticket via email
router.post("/:id/reply", adminProtect, replyToContact);
router.post("/reply/:id", adminProtect, replyToContact);

module.exports = router;
