const express = require('express');
const {
  createSEOAllpage,
  getSeoBySlug,
  getAllSeoPages,
  EditSeoPages,
  DeleteSeoPages,
  getSeoById
} = require('../controllers/seoPage.controller');

const router = express.Router();

router.post('/Add', createSEOAllpage);

// Get all
router.get("/Allpages", getAllSeoPages);

// ✅ GET SEO by slug (supports ?slug=... and /by-slug/path/to/slug)
router.get("/by-slug", getSeoBySlug);
router.get("/by-slug/:slug(.*)", getSeoBySlug);

// ✅ GET by id
router.get('/:id', getSeoById);



// Update by id
router.put("/:id", EditSeoPages);

// Delete by id
router.delete("/:id", DeleteSeoPages);

module.exports = router;
