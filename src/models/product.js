const mongoose = require("mongoose");
const {
  ALL_FUNCTIONS,
  SCOPE_OF_DELIVERY_OPTIONS,
  WATCH_TYPES,
  WATCHSTYLE_CATEGORY,
  GENDERS,
  MOVEMENTS,
  COLORS,
  MATERIALS,
  STRAP_MATERIALS,
  CRYSTALS,
  BEZEL_MATERIALS,
  CONDITIONS,
  ITEM_CONDITIONS,
  INCLUDE_ACCESSORIES,
  REPLACEMENT_PARTS,
  DIALNUMERALS,
} = require("../utils/productConstants");

// Leather Goods specific enums
const LEATHER_MAIN_CATEGORIES = [
  "Bag",
  "Wallet",
  "Card Holder",
  "Briefcase",
  "Clutch Bag",
  "Pouch",
];

const LEATHER_SUB_CATEGORIES = [
  "Tote Bag",
  "Crossbody Bag",
  "Card Holder",
  "Shoulder/Crossbody Bag",
  "Shoulder Bag",
  "Clutch",
  "Backpack",
  "Hand Bag",
  "Coin Purse",
  "Key Holder",
  "Travel Bag",
  "Pouch",
  "Long Bi-Fold Wallet",
  "Reversible Belt",
  "Business Bag",
];

// Accessory specific enums
const ACCESSORY_CATEGORIES = [
  "Writing Instruments",
  "Cufflinks",
  "Bracelets",
  "Keychains & Charms",
  "Travel & Lifestyle",
  "Home Accessories",
  "Sunglasses / Eyewear Accessories",
];

// Subcategories grouped by category
const ACCESSORY_SUB_CATEGORIES = {
  "Writing Instruments": [
    "Fountain Pens",
    "Ballpoint Pens",
    "Rollerball Pens",
    "Mechanical Pencils",
    "Pen Sets",
  ],
  Cufflinks: ["Metal Cufflinks", "Enamel Cufflinks"],
  Bracelets: [
    "Leather Bracelets",
    "Metal Bracelets",
    "Beaded Bracelets",
    "Chain Bracelets",
    "Charm Bracelets",
  ],
  "Keychains & Charms": [
    "Keychains",
    "Bag Charms",
    "Luggage Tags",
    "Carabiners",
  ],
  "Travel & Lifestyle": [
    "Travel Wallets",
    "Passport Covers",
    "Luggage Straps",
    "Tech Organizers",
    "Portable Ashtrays",
  ],
  "Home Accessories": [
    "Desk Organizers",
    "Bookends",
    "Candle Holders",
    "Decorative Trays",
    "Coasters",
  ],
  "Sunglasses / Eyewear Accessories": [
    "Sunglasses",
    "Eyeglass Chains",
    "Eyeglass Cases",
    "Lens Cleaning Kits",
  ],
};

// Flatten all subcategories
const ALL_SUBCATEGORIES = Object.values(ACCESSORY_SUB_CATEGORIES).flat();

const ACCESSORY_MATERIALS = [
  "Stainless Steel",
  "Leather",
  "Resin",
  "Silver",
  "Gold",
  "Platinum",
  "Titanium",
  "Brass",
  "Copper",
  "Ceramic",
  "Wood",
  "Fabric",
  "Plastic",
  "Crystal",
  "Pearl",
  "Enamel",
];

const ACCESSORY_COLORS = [
  "Black",
  "White",
  "Silver",
  "Gold",
  "Rose Gold",
  "Brown",
  "Blue",
  "Red",
  "Green",
  "Purple",
  "Pink",
  "Yellow",
  "Orange",
  "Gray",
  "Multi-color",
  "Transparent",
  "Metallic",
  "Chrome",
  "Gunmetal",
];

const LEATHER_MATERIALS = [
  "Full-grain leather",
  "Top-grain leather",
  "Genuine leather",
  "Suede",
  "Patent leather",
  "Saffiano leather",
  "Croc-embossed",
  "Pebble leather",
  "Canvas + Leather mix",
  "Vegan Leather (PU)",
  "Leather",
  "Fabric",
];

const INTERIOR_MATERIALS = [
  "Fabric",
  "Canvas",
  "Leather",
  "Suede",
  "Microfiber",
  "Textile",
  "Nylon",
  "Polyester",
  "Felt",
  "Satin",
  "Silk",
  "Cotton",
  "Wool Blend",
  "Alcantara",
];

const HARDWARE_COLORS = [
  "Gold",
  "Rose Gold",
  "Silver",
  "Platinum",
  "Chrome",
  "Gunmetal",
  "Black Metal",
  "Brass",
  "Matte Gold",
  "Matte Silver",
  "Ruthenium",
  "Palladium",
  "Antique Gold",
  "Antique Silver",
];

const LEATHER_GOODS_SCOPE_OF_DELIVERY = [
  "Original packaging",
  "Without papers",
  "Generic packaging",
  "Only bag",
  "With papers",
  "Original box only",
  "Dust bag",
];

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    values: [{ type: String }],
    visible: { type: Boolean, default: false },
    global: { type: Boolean, default: false },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String },
    type: { type: String, enum: ["main", "cover"], default: "cover" },
  },
  { _id: false }
);

const sizeSchema = new mongoose.Schema(
  {
    width: { type: Number },
    height: { type: Number },
    depth: { type: Number },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    // ==================== COMMON FIELDS FOR ALL PRODUCTS ====================

    // ────────────── BASIC IDENTIFICATION ──────────────
    name: { type: String },
    brand: { type: String },
    model: { type: String },
    sku: { type: String },

    // ────────────── CATEGORY INFORMATION ──────────────
    category: {
      type: String,
      enum: [
        "Watch",
        "Jewellery",
        "Gold",
        "Accessories",
        "Leather Goods",
        "Leather Bags",
      ],
      required: true,
      index: true,
    },

    // ────────────── PRICING & INVENTORY ──────────────
    regularPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    salePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxStatus: {
      type: String,
      enum: ["taxable", "shipping", "none"],
      default: "taxable",
    },
    limitedEdition: {
      type: Boolean,
      default: false,
    },

    stockQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    inStock: {
      type: Boolean,
      default: true,
      index: true,
    },
    sold: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ────────────── CONDITION INFORMATION ──────────────
    condition: {
      type: String,
      enum: CONDITIONS,
    },
    itemCondition: {
      type: String,
      enum: ITEM_CONDITIONS,
    },
    conditionNotes: { type: String },

    // ────────────── YEAR INFORMATION ──────────────
    productionYear: { type: String },
    approximateYear: { type: Boolean, default: false },
    unknownYear: { type: Boolean, default: false },

    // ────────────── DEMOGRAPHICS ──────────────
    gender: {
      type: String,
      enum: GENDERS,
      default: "Men/Unisex",
      index: true,
    },

    // ────────────── COLOR INFORMATION ──────────────
    color: {
      type: String,
      enum: COLORS,
    },

    // ────────────── TAGS & BADGES ──────────────
    badges: {
      type: [String],
      enum: ["Popular", "New Arrivals"],
      default: [],
    },

    // ────────────── DESCRIPTION & SEO ──────────────
    description: { type: String },
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoKeywords: [
      {
        type: String,
        index: true,
      },
    ],

    // ────────────── STATUS & VISIBILITY ──────────────
    published: {
      type: Boolean,
      default: true,
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ────────────── MEDIA ──────────────
    images: [imageSchema],

    // ────────────── ATTRIBUTES ──────────────
    attributes: [attributeSchema],

    // ==================== WATCH SPECIFIC FIELDS ====================
    watchType: {
      type: String,
      enum: WATCH_TYPES,
      index: true,
    },
    watchStyle: {
      type: String,
      enum: WATCHSTYLE_CATEGORY,
      index: true,
    },
    scopeOfDeliveryWatch: [
      {
        type: String,
        enum: SCOPE_OF_DELIVERY_OPTIONS,
        index: true,
      },
    ],
    includedAccessories: [
      {
        type: String,
        enum: INCLUDE_ACCESSORIES,
        index: true,
      },
    ],
    movement: {
      type: String,
      enum: MOVEMENTS,
    },
    caseMaterial: {
      type: String,
      enum: MATERIALS,
    },
    strapMaterial: {
      type: String,
      enum: STRAP_MATERIALS,
    },
    dialColor: {
      type: String,
      enum: COLORS,
    },
    caseSize: {
      type: Number,
      min: 0,
    },
    caseColor: {
      type: String,
      enum: COLORS,
    },
    strapColor: {
      type: String,
      enum: COLORS,
    },
    strapSize: {
      type: Number,
      min: 0,
    },
    crystal: {
      type: String,
      enum: CRYSTALS,
    },
    bezelMaterial: {
      type: String,
      enum: BEZEL_MATERIALS,
    },
    dialNumerals: {
      type: String,
      enum: DIALNUMERALS,
    },
    caliber: { type: String },
    powerReserve: {
      type: Number,
      min: 0,
    },
    jewels: {
      type: Number,
      min: 0,
    },
    functions: [
      {
        type: String,
        enum: ALL_FUNCTIONS,
        index: true,
      },
    ],
    replacementParts: [
      {
        type: String,
        enum: REPLACEMENT_PARTS,
        index: true,
      },
    ],

    // ==================== LEATHER GOODS SPECIFIC FIELDS ====================
    leatherMainCategory: {
      type: String,
      enum: LEATHER_MAIN_CATEGORIES,
      index: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.Mixed,
      index: true,
    },
    modelCode: { type: String },
    serialNumber: { type: String },
    additionalTitle: { type: String },
    referenceNumber: { type: String },
    leatherMaterial: {
      type: String,
      enum: LEATHER_MATERIALS,
    },
    interiorMaterial: {
      type: String,
      enum: INTERIOR_MATERIALS,
    },
    hardwareColor: {
      type: String,
      enum: HARDWARE_COLORS,
    },
    leatherSize: sizeSchema,
    strapLength: {
      type: Number,
      min: 0,
    },
    leatherAccessories: {
      type: [String],
      enum: [
        "Original box",
        "Dust bag",
        "Certificate of authenticity",
        "Care instructions",
        "Warranty card",
        "Gift box",
        "User manual",
        "Extra links",
        "Cleaning cloth",
        "Adjustment tools",
        "Only bag",
      ],
      index: true,
    },

    scopeOfDelivery: [
      {
        type: String,
        enum: LEATHER_GOODS_SCOPE_OF_DELIVERY,
        index: true,
      },
    ],

    // ==================== ACCESSORY SPECIFIC FIELDS ====================
    accessoryCategory: {
      type: String,
      enum: ACCESSORY_CATEGORIES,
      index: true,
    },
    accessorySubCategory: {
      type: String,
      enum: ALL_SUBCATEGORIES,
      index: true,
    },
    accessoryName: { type: String },
    accessoryMaterial: {
      type: [String],
      enum: ACCESSORY_MATERIALS,
      index: true,
    },
    accessoryColor: {
      type: [String],
      enum: ACCESSORY_COLORS,
      index: true,
    },
    accessoryDelivery: {
      type: [String],
      enum: [
        "Original box",
        "Dust bag",
        "Certificate of authenticity",
        "Care instructions",
        "Warranty card",
        "Gift box",
        "User manual",
        "Extra links",
        "Cleaning cloth",
        "Adjustment tools",
      ],
      index: true,
    },
    accessoryScopeOfDelivery: {
      type: [String],
      enum: [
        "Original packaging",
        "With papers",
        "Without papers",
        "Original box only",
        "Generic packaging",
      ],
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "products",

    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Run custom cleaner if it exists
        if (typeof doc._cleanResponseByCategory === "function") {
          doc._cleanResponseByCategory(ret);
        }

        // Always remove __v
        delete ret.__v;

        // Convert _id → id for frontend (BEST PRACTICE)
        if (ret._id) {
          ret.id = ret._id.toString();
        }

        // ❗ Do NOT delete _id — populate & relations need it
        return ret;
      },
    },

    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        // Run custom cleaner if it exists
        if (typeof doc._cleanResponseByCategory === "function") {
          doc._cleanResponseByCategory(ret);
        }

        // Always remove __v
        delete ret.__v;

        // Convert _id → id for frontend
        if (ret._id) {
          ret.id = ret._id.toString();
        }

        // ❗ Do NOT delete _id
        return ret;
      },
    },
  }
);

// Clean response by category
productSchema.methods._cleanResponseByCategory = function (ret) {
  const category = ret.category;

  // For Leather Goods
  if (category === "Leather Goods" || category === "Leather Bags") {
    this._removeWatchFields(ret);
    this._removeAccessoryFields(ret);
    return;
  }

  // For Watches
  if (category === "Watch") {
    this._removeLeatherGoodsFields(ret);
    this._removeAccessoryFields(ret);
    return;
  }

  // For Accessories
  if (category === "Accessories") {
    this._removeWatchFields(ret);
    this._removeLeatherGoodsFields(ret);
    return;
  }

  // For Jewellery and Gold (remove all other category fields)
  this._removeWatchFields(ret);
  this._removeLeatherGoodsFields(ret);
  this._removeAccessoryFields(ret);
};

// Helper methods to remove category-specific fields
productSchema.methods._removeWatchFields = function (ret) {
  const watchFields = [
    "watchType",
    "watchStyle",
    "scopeOfDelivery",
    "includedAccessories",
    "movement",
    "caseMaterial",
    "strapMaterial",
    "dialColor",
    "caseSize",
    "caseColor",
    "strapColor",
    "strapSize",
    "crystal",
    "bezelMaterial",
    "dialNumerals",
    "caliber",
    "powerReserve",
    "jewels",
    "functions",
    "replacementParts",
  ];

  watchFields.forEach((field) => delete ret[field]);
};

productSchema.methods._removeLeatherGoodsFields = function (ret) {
  const leatherFields = [
    "leatherMainCategory",
    "subcategory",
    "modelCode",
    "leatherMaterial",
    "interiorMaterial",
    "hardwareColor",
    "leatherSize",
    "strapLength",
    "leatherAccessories",
  ];

  leatherFields.forEach((field) => delete ret[field]);
};

productSchema.methods._removeAccessoryFields = function (ret) {
  const accessoryFields = [
    "accessoryCategory",
    "accessorySubCategory",
    "accessoryName",
    "accessoryMaterial",
    "accessoryColor",
    "accessoryDelivery",
    "accessoryScopeOfDelivery",
  ];

  accessoryFields.forEach((field) => delete ret[field]);
};

// ==================== VIRTUAL FIELDS ====================

// Check if product is on sale
productSchema.virtual("isOnSale").get(function () {
  return this.salePrice > 0 && this.salePrice < this.regularPrice;
});

// Calculate discount percentage
productSchema.virtual("discountPercentage").get(function () {
  if (
    this.salePrice > 0 &&
    this.salePrice < this.regularPrice &&
    this.regularPrice > 0
  ) {
    return Math.round(
      ((this.regularPrice - this.salePrice) / this.regularPrice) * 100
    );
  }
  return 0;
});

// Display price (sale price if available, otherwise regular price)
productSchema.virtual("displayPrice").get(function () {
  return this.salePrice > 0 ? this.salePrice : this.regularPrice;
});

// Original price (always regular price)
productSchema.virtual("originalPrice").get(function () {
  return this.regularPrice;
});

// ==================== MIDDLEWARE ====================

// Pre-save middleware
productSchema.pre("save", function (next) {
  // Generate name if not provided
  if (!this.name) {
    const nameParts = [];

    if (this.brand) nameParts.push(this.brand);
    if (this.model) nameParts.push(this.model);

    // For accessories, use accessory name
    if (this.category === "Accessories" && this.accessoryName) {
      this.name = this.accessoryName;
    } else if (nameParts.length > 0) {
      this.name = nameParts.join(" ");
    }
  }

  // Ensure sale price is set if not provided
  if (this.salePrice === undefined || this.salePrice === 0) {
    this.salePrice = this.regularPrice;
  }

  // For leather goods, ensure color field is populated
  if (
    (this.category === "Leather Goods" || this.category === "Leather Bags") &&
    !this.color
  ) {
    // If there's a dialColor (from old data), use it
    if (this.dialColor) {
      this.color = this.dialColor;
    }
  }

  next();
});

// ==================== STATIC METHODS ====================

// Find products by category
productSchema.statics.findByCategory = function (category, query = {}) {
  return this.find({
    category,
    published: true,
    ...query,
  });
};

// Find leather goods
productSchema.statics.findLeatherGoods = function (query = {}) {
  return this.find({
    $or: [{ category: "Leather Goods" }, { category: "Leather Bags" }],
    published: true,
    ...query,
  });
};

// Find accessories
productSchema.statics.findAccessories = function (query = {}) {
  return this.find({
    category: "Accessories",
    published: true,
    ...query,
  });
};

// Find watches
productSchema.statics.findWatches = function (query = {}) {
  return this.find({
    category: "Watch",
    published: true,
    ...query,
  });
};

// ==================== INSTANCE METHODS ====================

// Get category-specific data
productSchema.methods.getCategoryData = function () {
  const baseData = {
    id: this._id ? this._id.toString() : this.id,
    name: this.name,
    brand: this.brand,
    model: this.model,
    category: this.category,
    regularPrice: this.regularPrice,
    salePrice: this.salePrice,
    displayPrice: this.displayPrice,
    isOnSale: this.isOnSale,
    discountPercentage: this.discountPercentage,
    images: this.images,
    condition: this.condition,
    inStock: this.inStock,
    stockQuantity: this.stockQuantity,
  };

  switch (this.category) {
    case "Leather Goods":
    case "Leather Bags":
      return {
        ...baseData,
        leatherMainCategory: this.leatherMainCategory,
        subcategory: this.subcategory,
        leatherMaterial: this.leatherMaterial,
        color: this.color,
        hardwareColor: this.hardwareColor,
        leatherSize: this.leatherSize,
        productionYear: this.productionYear,
      };

    case "Watch":
      return {
        ...baseData,
        watchType: this.watchType,
        watchStyle: this.watchStyle,
        movement: this.movement,
        caseSize: this.caseSize,
        dialColor: this.dialColor,
        caseMaterial: this.caseMaterial,
      };

    case "Accessories":
      return {
        ...baseData,
        accessoryCategory: this.accessoryCategory,
        accessorySubCategory: this.accessorySubCategory,
        accessoryName: this.accessoryName,
        accessoryMaterial: this.accessoryMaterial,
        accessoryColor: this.accessoryColor,
      };

    default:
      return baseData;
  }
};

// ==================== INDEXES ====================

// Main product listing indexes
productSchema.index({ published: 1, inStock: 1, createdAt: -1 });
productSchema.index({ category: 1, published: 1, createdAt: -1 });
productSchema.index({ brand: 1, category: 1, published: 1 });

// Price indexes
productSchema.index({ salePrice: 1, published: 1 });
productSchema.index({ regularPrice: 1, published: 1 });

// Category-specific compound indexes
// Leather Goods
productSchema.index({
  category: 1,
  leatherMainCategory: 1,
  published: 1,
});
productSchema.index({
  category: 1,
  subcategory: 1,
  published: 1,
});

// Watches
productSchema.index({
  category: 1,
  watchType: 1,
  published: 1,
});

// Accessories
productSchema.index({
  category: 1,
  accessoryCategory: 1,
  published: 1,
});

// Compound index for stock/availability filtering (used by search queries)
productSchema.index({ published: 1, stockQuantity: 1, inStock: 1 });

// Text search index — covers all searchable fields with relevance weights
productSchema.index(
  {
    name: "text",
    brand: "text",
    model: "text",
    referenceNumber: "text",
    accessoryName: "text",
    sku: "text",
    category: "text",
    leatherMainCategory: "text",
    leatherSubCategory: "text",
    watchType: "text",
    watchStyle: "text",
    accessoryCategory: "text",
    accessorySubCategory: "text",
    description: "text",
  },
  {
    name: "product_search_index",
    weights: {
      name: 10,
      brand: 10,
      model: 8,
      referenceNumber: 8,
      accessoryName: 8,
      sku: 6,
      category: 4,
      leatherMainCategory: 4,
      leatherSubCategory: 4,
      watchType: 4,
      watchStyle: 4,
      accessoryCategory: 4,
      accessorySubCategory: 4,
      description: 1,
    },
  }
);

module.exports = mongoose.model("Product", productSchema, "products");
