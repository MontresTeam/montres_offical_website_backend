const express = require('express');
const {
  createSEOAllpage,
  getSeoBySlug,
  getAllSeoPages,
  EditSeoPages,
  DeleteSeoPages,
  getSeoById
} = require('../controllers/seoPage.controller');
const { adminProtect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.get("/Allpages", getAllSeoPages);
router.get("/by-slug", getSeoBySlug);
router.get('/:id', getSeoById);

// Admin-protected mutation routes (full access for admin & content_manager)
router.post('/Add', adminProtect, createSEOAllpage);
router.put("/:id", adminProtect, EditSeoPages);
router.delete("/:id", adminProtect, DeleteSeoPages);

module.exports = router;
