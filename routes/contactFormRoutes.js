const express = require("express");
const router = express.Router();
const {
  submitContactForm,
  getAllContacts,
  deleteContact,
} = require("../controllers/contactFormController");
const imageUpload = require("../config/multerConfig");


const { adminProtect } = require("../middlewares/authMiddleware");

// 📩 Submit contact form (with Cloudinary upload) - Public
router.post("/submit", imageUpload, submitContactForm);

// 📜 Get all contact submissions - Admin only
router.get("/", adminProtect, getAllContacts);

const { getContactById } = require("../controllers/contactFormController");
// 📜 Get single contact submission - Admin only
router.get("/:id", adminProtect, getContactById);

// 🗑 Delete contact - Admin only
router.delete("/:id", adminProtect, deleteContact);

module.exports = router;
