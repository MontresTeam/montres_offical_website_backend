const express = require("express");
const { filerDatareferenceNumber, getWatchFilters, getBrandFilters, getFacetedFilters } = require("../controllers/filterController");
const router = express.Router();

router.get("/reference-numbers", filerDatareferenceNumber);
router.get("/watch-filters", getWatchFilters);
router.get("/brand-filters", getBrandFilters);
router.get("/faceted-filters", getFacetedFilters);

module.exports = router;    
