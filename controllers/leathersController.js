const Product = require("../models/product");
const mongoose = require("mongoose");



// Get All Leather Goods
const getAllLeatherGoods = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 16,
      sortBy = "newest",
      // Filter parameters
      category,
      subCategory,
      brand,
      color,
      material,
      condition,
      gender,
      hardware,
      interiorMaterial,
      availability,
      style,
      size,
      compartment,
      minPrice,
      maxPrice,
      // Search
      search
    } = req.query;

    // ✅ Base filter - only leather goods
    let filter = { categorisOne: "leather" };

    // ✅ Category filter (from URL params or query)
    if (req.params.category && req.params.category !== 'All') {
      filter.category = req.params.category;
    } else if (category) {
      // Also support category from query params
      if (Array.isArray(category)) {
        filter.category = { $in: category };
      } else {
        filter.category = category;
      }
    }

    // ✅ Subcategory filter
    if (subCategory) {
      if (Array.isArray(subCategory)) {
        filter.subcategory = { $in: subCategory };
      } else {
        filter.subcategory = subCategory;
      }
    }

    // ✅ Brand filter
    if (brand) {
      if (Array.isArray(brand)) {
        filter.brand = { $in: brand };
      } else {
        filter.brand = brand;
      }
    }

    // ✅ Color filter (using color field)
    if (color) {
      if (Array.isArray(color)) {
        filter.color = { $in: color };
      } else {
        filter.color = color;
      }
    }

    // ✅ Material filter
    if (material) {
      if (Array.isArray(material)) {
        filter.leatherMaterial = { $in: material };
      } else {
        filter.leatherMaterial = material;
      }
    }

    // ✅ Condition filter
    if (condition) {
      if (Array.isArray(condition)) {
        filter.condition = { $in: condition };
      } else {
        filter.condition = condition;
      }
    }

    // ✅ Gender filter
    if (gender) {
      if (Array.isArray(gender)) {
        filter.gender = { $in: gender };
      } else {
        filter.gender = gender;
      }
    }

    // ✅ Hardware filter
    if (hardware) {
      if (Array.isArray(hardware)) {
        filter.hardwareColor = { $in: hardware };
      } else {
        filter.hardwareColor = hardware;
      }
    }

    // ✅ Interior Material filter
    if (interiorMaterial) {
      if (Array.isArray(interiorMaterial)) {
        filter.interiorMaterial = { $in: interiorMaterial };
      } else {
        filter.interiorMaterial = interiorMaterial;
      }
    }

    // ✅ Availability filter
    if (availability) {
      const availabilityFilter = [];

      if (Array.isArray(availability)) {
        availability.forEach(avail => {
          if (avail === 'in_stock') availabilityFilter.push(true);
          if (avail === 'out_of_stock') availabilityFilter.push(false);
        });
      } else {
        if (availability === 'in_stock') availabilityFilter.push(true);
        if (availability === 'out_of_stock') availabilityFilter.push(false);
      }

      if (availabilityFilter.length > 0) {
        filter.inStock = { $in: availabilityFilter };
      }
    }

    // ✅ Price range filter
    if (minPrice || maxPrice) {
      filter.salePrice = {};
      if (minPrice) filter.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) filter.salePrice.$lte = parseInt(maxPrice);
    }

    // ✅ Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }


    // ✅ Convert pagination numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // ✅ Build sort object
    let sortOptions = {};
    switch (sortBy) {
      case 'price_low_high':
        sortOptions = { salePrice: 1 };
        break;
      case 'price_high_low':
        sortOptions = { salePrice: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'premium':
        // Sort by brand prestige or price high to low
        sortOptions = { salePrice: -1 };
        break;
      case 'rating':
        // If you have rating field
        sortOptions = { rating: -1 };
        break;
      case 'discount':
        // Calculate discount percentage and sort
        sortOptions = {
          $expr: {
            $subtract: [
              { $divide: [{ $subtract: ["$regularPrice", "$salePrice"] }, "$regularPrice"] },
              1
            ]
          }
        };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // ✅ Count total products
    const totalProducts = await Product.countDocuments(filter);

    // ✅ Fetch paginated products
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select('-__v'); // Exclude version key

    return res.json({
      totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products: products.map(product => product.toObject()),
    });
  } catch (err) {
    console.error("Error fetching leather goods:", err);
    res.status(500).json({
      message: "❌ Error fetching leather goods",
      error: err.message,
    });
  }
};


const getProductsByLeatherSubCategory = async (req, res) => {
  try {
    const { leatherSubCategory } = req.params;
    const { page = 1, limit = 16, sortBy = "newest" } = req.query;

    if (!leatherSubCategory) {
      return res.status(400).json({ success: false, message: "Sub-category is required" });
    }

    // Filter for "Leather Bags" category and subcategory match
    const filter = {
      category: { $regex: "Leather", $options: "i" }, // matches Leather Goods or Leather Bags
      $or: [
        { leatherSubCategory: { $regex: leatherSubCategory, $options: "i" } },
        { leatherSubCategory: { $in: [new RegExp(leatherSubCategory, "i")] } }
      ]
    };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    let sortOptions = {};
    switch (sortBy) {
      case "price_low_high":
        sortOptions = { sellingPrice: 1 };
        break;
      case "price_high_low":
        sortOptions = { sellingPrice: -1 };
        break;
      case "rating":
        sortOptions = { rating: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    const totalProducts = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select("-__v");

    res.json({
      success: true,
      totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products
    });

  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: err.message
    });
  }
};



const addLeathergoods = async (req, res) => {
  try {
    const {
      MainCategory,
      SubCategory,
      Brand,
      Model,
      modelCode,
      additionalTitle,
      serialNumber,
      sku,
      productionYear,
      approximateYear,
      unknownYear,
      gender,
      Material,
      interiorMaterial,
      Color,
      hardwareColor,
      condition,
      itemCondition,
      conditionNotes,
      size,
      strapLength,

      // ✅ FIXED FIELD NAMES
      leatherAccessories,
      scopeOfDelivery,

      taxStatus,
      stockQuantity,
      inStock,
      badges,
      images,
      seoTitle,
      seoDescription,
      seoKeywords,
      retailPrice,
      sellingPrice,
      description,
    } = req.body;

    // ✅ FIX: Coerce boolean strings from FormData ("true" / "false")
    const parseBool = (val, defaultVal = false) => {
      if (val === true || val === "true") return true;
      if (val === false || val === "false") return false;
      return defaultVal;
    };

    // ✅ FIX: Coerce numeric strings from FormData
    const parseNum = (val, defaultVal = 0) => {
      const n = parseFloat(val);
      return isNaN(n) ? defaultVal : n;
    };

    // ✅ FIX: Ensure arrays are actually arrays
    const toArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return [val];
    };

    // Auto-set category based on MainCategory
    let category = "Leather Goods";
    if (
      ["Bag", "Briefcase", "Pouch", "Clutch Bag", "Backpack", "Hand Bag"].includes(MainCategory)
    ) {
      category = "Leather Bags";
    }

    // Generate automatic product name
    const generateProductName = () => {
      const nameParts = [];
      if (Brand) nameParts.push(Brand);
      if (Model) nameParts.push(Model);
      if (MainCategory) nameParts.push(MainCategory);
      return nameParts.join(" ") || "Unnamed Leather Good";
    };

    const newLeather = new Product({
      category,
      categorisOne: "leather", // ✅ Legacy compatibility
      brand: Brand,
      model: Model,
      name: generateProductName(),

      // Leather goods specific fields
      leatherMainCategory: MainCategory,
      leatherSubCategory: SubCategory, // ✅ Modern schema field
      subcategory: [SubCategory], // ✅ Legacy array field
      modelCode,
      additionalTitle,
      serialNumber,
      sku,

      // Year information
      productionYear: parseBool(unknownYear) ? "unknown" : productionYear,
      approximateYear: parseBool(approximateYear),
      unknownYear: parseBool(unknownYear),

      // Demographics and materials
      gender: gender || "Men/Unisex",
      leatherMaterial: Material,
      interiorMaterial,
      color: Color,
      hardwareColor,

      // Condition
      condition,
      itemCondition,
      conditionNotes,

      // ✅ FIX: Parse size from JSON string (FormData sends objects as JSON strings)
      leatherSize: (() => {
        if (!size) return undefined;
        try {
          const s = typeof size === "string" ? JSON.parse(size) : size;
          return {
            width: parseNum(s.width),
            height: parseNum(s.height),
            depth: parseNum(s.depth)
          };
        } catch (e) {
          console.warn("⚠️ Could not parse size field:", size);
        }
        return undefined;
      })(),

      strapLength: strapLength ? parseNum(strapLength) : undefined,

      // Accessories and delivery
      leatherAccessories: toArray(leatherAccessories),
      scopeOfDelivery: toArray(scopeOfDelivery),

      // Pricing
      regularPrice: parseNum(retailPrice),
      salePrice: parseNum(sellingPrice) || parseNum(retailPrice),
      taxStatus: taxStatus || "taxable",
      stockQuantity: parseNum(stockQuantity, 1),
      inStock: parseBool(inStock, true),

      // Badges and images
      badges: toArray(badges),
      images: images || [],

      // SEO
      seoTitle,
      seoDescription,
      seoKeywords: toArray(seoKeywords),

      // Description
      description,

      // Status
      published: true,
    });

    const savedLeather = await newLeather.save();

    res.status(201).json({
      success: true,
      message: "Leather goods added successfully",
      data: savedLeather.toObject(),
    });
  } catch (error) {
    console.error("Error adding leather goods:", error);
    res.status(500).json({
      success: false,
      message: "Server error, could not add leather goods",
      error: error.message,
    });
  }
};


// ---------------- Update Leather Goods ----------------
const updateLeathergoods = async (req, res) => {
  try {
    const leatherId = req.params.id;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(leatherId)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid leather product ID format",
      });
    }

    const body = req.body;
    const updateData = {};

    // Map MixedCase form fields to schema fields
    if (body.Brand) updateData.brand = body.Brand;
    if (body.Model) updateData.model = body.Model;
    if (body.MainCategory) updateData.leatherMainCategory = body.MainCategory;
    if (body.SubCategory) {
      updateData.leatherSubCategory = body.SubCategory;
      updateData.subcategory = [body.SubCategory];
    }
    if (body.Material) updateData.leatherMaterial = body.Material;
    if (body.Color) updateData.color = body.Color;
    if (body.interiorMaterial) updateData.interiorMaterial = body.interiorMaterial;
    if (body.hardwareColor) updateData.hardwareColor = body.hardwareColor;

    // Pricing
    if (body.retailPrice !== undefined && body.retailPrice !== "") {
      const price = parseFloat(body.retailPrice);
      updateData.regularPrice = isNaN(price) ? 0 : price;
    }
    if (body.sellingPrice !== undefined && body.sellingPrice !== "") {
      const price = parseFloat(body.sellingPrice);
      updateData.salePrice = isNaN(price) ? 0 : price;
    }

    // ── Typed direct field mappings ──────────────────────────────────────────

    // String fields – copy as-is
    const stringFields = [
      "modelCode", "additionalTitle", "serialNumber", "sku", "productionYear",
      "gender", "condition", "itemCondition", "conditionNotes",
      "taxStatus", "seoTitle", "seoDescription", "description"
    ];
    stringFields.forEach(field => {
      if (body[field] !== undefined) updateData[field] = body[field];
    });

    // Boolean fields – coerce "true" / "false" strings from FormData
    const parseBool = (val, def = false) => {
      if (val === true  || val === "true")  return true;
      if (val === false || val === "false") return false;
      return def;
    };
    if (body.approximateYear !== undefined) updateData.approximateYear = parseBool(body.approximateYear);
    if (body.unknownYear     !== undefined) updateData.unknownYear     = parseBool(body.unknownYear);

    // Numeric fields – always parse
    if (body.strapLength !== undefined && body.strapLength !== "") {
      updateData.strapLength = parseFloat(body.strapLength) || 0;
    }

    // stockQuantity → also auto-derive inStock
    if (body.stockQuantity !== undefined) {
      const qty = parseInt(body.stockQuantity, 10);
      updateData.stockQuantity = isNaN(qty) ? 0 : qty;
      // Auto-sync inStock unless the caller explicitly overrides it below
      updateData.inStock = updateData.stockQuantity > 0;
    }
    // Allow caller to explicitly override inStock even when stockQuantity isn't sent
    if (body.inStock !== undefined && body.stockQuantity === undefined) {
      updateData.inStock = parseBool(body.inStock, true);
    }

    // Array fields
    const toArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return [val];
    };
    if (body.badges      !== undefined) updateData.badges      = toArray(body.badges);
    if (body.seoKeywords !== undefined) updateData.seoKeywords = toArray(body.seoKeywords);

    // ── Image handling ───────────────────────────────────────────────────────
    // Priority: newly uploaded (via Cloudinary multer) > explicit body.images > keep existing
    // The multer middleware puts Cloudinary results in req.body.uploadedImages
    const newlyUploaded = req.body.uploadedImages
      ? (Array.isArray(req.body.uploadedImages) ? req.body.uploadedImages : [req.body.uploadedImages])
      : [];

    // existingImages is sent as JSON string from the frontend
    let existingImages = [];
    if (body.existingImages) {
      try {
        existingImages = typeof body.existingImages === "string"
          ? JSON.parse(body.existingImages)
          : body.existingImages;
      } catch (e) {
        console.warn("Could not parse existingImages:", body.existingImages);
      }
    }

    if (newlyUploaded.length > 0) {
      // New uploads: prepend them in front of retained existing images
      updateData.images = [...newlyUploaded, ...existingImages];
    } else if (existingImages.length > 0) {
      // No new uploads but existing images sent → preserve them
      updateData.images = existingImages;
    }
    // If neither sent, leave images field untouched in DB (no updateData.images key)

    // Also ensure leatherAccessories / scopeOfDelivery are always arrays
    if (body.leatherAccessories) updateData.leatherAccessories = toArray(body.leatherAccessories);
    if (body.scopeOfDelivery)    updateData.scopeOfDelivery    = toArray(body.scopeOfDelivery);

    // Handle unknown year
    if (updateData.unknownYear === true) {
      updateData.productionYear = "unknown";
      updateData.approximateYear = false;
    }

    // Handle nested size object
    if (body.size) {
      try {
        const s = typeof body.size === "string" ? JSON.parse(body.size) : body.size;
        updateData.leatherSize = {
          width: parseFloat(s.width) || 0,
          height: parseFloat(s.height) || 0,
          depth: parseFloat(s.depth) || 0
        };
      } catch (e) { }
    }

    // Category auto-update
    if (updateData.leatherMainCategory) {
      if (["Bag", "Briefcase", "Pouch", "Hand Bag", "Backpack"].includes(updateData.leatherMainCategory)) {
        updateData.category = "Leather Bags";
      } else {
        updateData.category = "Leather Goods";
      }
    }

    // Auto-generate name if identity fields change
    const identityChanged = updateData.brand || updateData.model || updateData.leatherMainCategory;
    if (identityChanged) {
      const current = await Product.findById(leatherId);
      if (current) {
        const b = updateData.brand || current.brand;
        const m = updateData.model || current.model;
        const c = updateData.leatherMainCategory || current.leatherMainCategory;
        updateData.name = [b, m, c].filter(Boolean).join(" ");
      }
    }

    const updatedLeather = await Product.findByIdAndUpdate(
      leatherId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedLeather) {
      return res.status(404).json({
        success: false,
        message: "Leather goods not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Leather goods updated successfully",
      data: updatedLeather.toObject(),
    });
  } catch (error) {
    console.error("Error updating leather goods:", error);
    res.status(500).json({
      success: false,
      message: "Server error, could not update leather goods",
      error: error.message,
    });
  }
};


const getLeatherBags = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 16,
      sortBy = "newest",
      minPrice,
      maxPrice,
      brand,
      color,
      material,
      leatherType,
      size,
      subCategory,
      condition,
      gender,
      availability,
      // Add other filter parameters as needed
    } = req.query;

    // Build filter object
    const filter = {
      leatherMainCategory: "Bag"
    };

    // Price filter (using salePrice)
    if (minPrice || maxPrice) {
      filter.salePrice = {};
      if (minPrice) filter.salePrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.salePrice.$lte = parseFloat(maxPrice);
    }

    // Array filters (brand, color, material, etc.)
    if (brand) {
      filter.brand = Array.isArray(brand) ? { $in: brand } : brand;
    }

    if (color) {
      filter.color = Array.isArray(color) ? { $in: color } : color;
    }

    if (material) {
      filter.leatherMaterial = Array.isArray(material) ? { $in: material } : material;
    }

    if (leatherType) {
      filter.leatherType = Array.isArray(leatherType) ? { $in: leatherType } : leatherType;
    }

    if (size) {
      filter.size = Array.isArray(size) ? { $in: size } : size;
    }

    if (subCategory) {
      filter.subcategory = Array.isArray(subCategory) ? { $in: subCategory } : subCategory;
    }

    if (condition) {
      filter.condition = Array.isArray(condition) ? { $in: condition } : condition;
    }

    if (gender) {
      filter.gender = Array.isArray(gender) ? { $in: gender } : gender;
    }

    // Availability filter
    if (availability) {
      const availabilityArray = Array.isArray(availability) ? availability : [availability];
      if (availabilityArray.includes('In Stock') && availabilityArray.includes('Sold Out')) {
        // Show all products
      } else if (availabilityArray.includes('In Stock')) {
        filter.inStock = true;
      } else if (availabilityArray.includes('Sold Out')) {
        filter.inStock = false;
      }
    }

    console.log("Database filter:", JSON.stringify(filter, null, 2));

    // Sort options
    let sortOptions = {};
    switch (sortBy) {
      case "price_low_high":
        sortOptions = { price: 1 };
        break;
      case "price_high_low":
        sortOptions = { price: -1 };
        break;
      case "newest":
        sortOptions = { createdAt: -1 };
        break;
      case "rating":
        sortOptions = { rating: -1 };
        break;
      case "discount":
        sortOptions = { discount: -1 };
        break;
      case "premium":
        sortOptions = { isPremium: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limitNum);

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No leather bags found matching your criteria",
        data: {
          products: [],
          totalPages: 0,
          currentPage: pageNum,
          totalProducts: 0
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        products,
        totalPages,
        currentPage: pageNum,
        totalProducts,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error("Error fetching leather bags:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

const getLeatherSubcategories = async (req, res) => {
  try {
    const subCategories = await Product.distinct("subcategory", {
      $or: [
        { category: "Leather Bags" },
        { category: "Leather Goods" },
        { categorisOne: "leather" }
      ],
      published: true
    });

    res.json({
      success: true,
      subcategories: subCategories.filter(Boolean).sort()
    });
  } catch (err) {
    console.error("Error fetching leather subcategories:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getAllLeatherGoods, addLeathergoods, updateLeathergoods, getLeatherBags, getProductsByLeatherSubCategory, getLeatherSubcategories };