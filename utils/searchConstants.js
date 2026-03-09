// Shared search constants — single source of truth for Fuse keys,
// field weights, and the MongoDB .select() projection string.
// Imported by productController.js to avoid hardcoding in two places.

const FUSE_KEYS = [
  { name: "brand",            weight: 0.40 },
  { name: "name",             weight: 0.30 },
  { name: "model",            weight: 0.12 },
  { name: "referenceNumber",  weight: 0.08 },
  { name: "category",         weight: 0.05 },
  { name: "accessoryCategory",weight: 0.03 },
  { name: "watchType",        weight: 0.02 },
];

// All fields needed for client-side scoring + Fuse on the frontend.
// Keep this list in sync with searchLogic.js fuseOptions.keys.
const SEARCH_SELECT_FIELDS = [
  // Fuse-scored fields
  ...FUSE_KEYS.map(k => k.name),
  // Extra fields used by the frontend scorer / router
  "regularPrice",
  "salePrice",
  "images",
  "leatherMainCategory",
  "subcategory",
  "inStock",
  "stockQuantity",
  "accessorySubCategory",
  "watchStyle",
  "leatherSubCategory",
];

const SEARCH_SELECT = SEARCH_SELECT_FIELDS.join(" ");

const FUSE_OPTIONS = {
  keys: FUSE_KEYS,
  threshold: 0.38,      // 0 = exact, 1 = match anything — 0.38 tolerates ~2 char typos
  includeScore: true,
  minMatchCharLength: 3,
};

module.exports = { FUSE_KEYS, SEARCH_SELECT, FUSE_OPTIONS };
