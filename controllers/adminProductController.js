const Product = require("../models/product");
const notifyRestock = require("../utils/notifyRestock"); // Restock notification utility
const mongoose = require("mongoose");

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID format",
      });
    }

    // Check if product exists
    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Delete product
    await Product.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting product",
      error: error.message,
    });
  }
};


// -----------------------------
// Helpers
// -----------------------------

const parseJSON = (field) => {
  if (!field) return [];
  try {
    return typeof field === "string" ? JSON.parse(field) : field;
  } catch {
    return Array.isArray(field) ? field : [field];
  }
};

const parseNumber = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
};

const parseIntNum = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? 0 : parsed;
};

const parseBoolean = (val) => val === "true" || val === true;

const parseCondition = (value) => {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string" && value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return value;
    }
  }
  return value;
};

// =============================
// ADD PRODUCT
// =============================

const addProduct = async (req, res) => {
  try {
    const productData = req.body;

    const images = productData.images || [];

    if (!productData.brand || !productData.model || !productData.category) {
      return res.status(400).json({
        message: "Brand, model and category are required fields.",
      });
    }

    // Apply year formatting
    let productionYearValue = productData.productionYear || "";

    if (parseBoolean(productData.unknownYear)) {
      productionYearValue = "Unknown";
    } else if (
      parseBoolean(productData.approximateYear) &&
      productionYearValue
    ) {
      productionYearValue = `Approx. ${productionYearValue}`;
    }

    // Auto product name
    const productName =
      productData.name || `${productData.brand} ${productData.model}`;

    // Auto stock flag
    const stockQuantity = parseIntNum(productData.stockQuantity);
    const inStock = stockQuantity > 0;

    const newProduct = new Product({
      brand: productData.brand,
      model: productData.model,
      name: productName,
      sku: productData.sku || "",
      referenceNumber: productData.referenceNumber || "",
      serialNumber: productData.serialNumber || "",
      additionalTitle: productData.additionalTitle || "",
      watchType: productData.watchType || "",
      watchStyle: productData.watchStyle || "",

      scopeOfDeliveryWatch: parseJSON(productData.scopeOfDeliveryWatch),
      includedAccessories: parseJSON(productData.includedAccessories),

      category: productData.category,

      condition: parseCondition(productData.condition),
      itemCondition: parseCondition(productData.itemCondition),

      // ⭐ LIMITED EDITION FIELD ⭐
      limitedEdition: parseBoolean(productData.limitedEdition),

      productionYear: productionYearValue,
      deliveryDays: parseIntNum(productData.deliveryDays) || 3,
      approximateYear: parseBoolean(productData.approximateYear),
      unknownYear: parseBoolean(productData.unknownYear),

      gender: productData.gender || "Men/Unisex",
      movement: productData.movement || "",
      dialColor: productData.dialColor || "",
      caseMaterial: productData.caseMaterial || "",
      strapMaterial: productData.strapMaterial || "",
      strapColor: productData.strapColor || "",

      badges: [...new Set(parseJSON(productData.badges))],
      strapSize: parseNumber(productData.strapSize),
      caseSize: parseNumber(productData.caseSize),
      caseColor: productData.caseColor || "",
      crystal: productData.crystal || "",
      bezelMaterial: productData.bezelMaterial || "",
      dialNumerals: productData.dialNumerals || "No Numerals",

      caliber: productData.caliber || "",
      powerReserve: parseNumber(productData.powerReserve),
      jewels: parseIntNum(productData.jewels),
      functions: parseJSON(productData.functions),
      replacementParts: parseJSON(productData.replacementParts),

      regularPrice: parseNumber(productData.regularPrice),
      salePrice: parseNumber(productData.salePrice),
      taxStatus: productData.taxStatus || "taxable",
      stockQuantity: stockQuantity,

      inStock: inStock,

      description: productData.description || "",
      visibility: productData.visibility || "visible",

      seoTitle: productData.seoTitle || "",
      seoDescription: productData.seoDescription || "",
      seoKeywords: parseJSON(productData.seoKeywords),

      // Make Offer System
      make_offer_enabled: parseBoolean(productData.make_offer_enabled),
      minimum_offer_type: productData.minimum_offer_type || "percentage",
      minimum_offer_percentage: parseNumber(productData.minimum_offer_percentage) || 80,
      minimum_offer_amount: parseNumber(productData.minimum_offer_amount) || 0,
      suggested_offer_percentages: parseJSON(productData.suggested_offer_percentages) || [95, 90, 85],
      acceptance_probability_rules: parseJSON(productData.acceptance_probability_rules) || { high: 95, possible: 90, low: 85 },
      auto_counter_offer_threshold: parseNumber(productData.auto_counter_offer_threshold) || 70,
      offer_expiration_time: parseIntNum(productData.offer_expiration_time) || 24,

      published: productData.published ?? true,
      featured: productData.featured ?? false,

      images,

      meta: productData.meta || {},
      attributes: productData.attributes || [],
      publishSchedule: productData.publishSchedule || {
        status: (productData.published === false || productData.published === "false") ? 'draft' : 'published',
        scheduledPublish: false
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedProduct = await newProduct.save();

    const response = await Product.findById(savedProduct._id).select(
      "brand model name sku referenceNumber serialNumber watchType watchStyle scopeOfDeliveryWatch " +
      "productionYear gender movement dialColor caseMaterial strapMaterial strapColor dialNumerals " +
      "salePrice regularPrice stockQuantity taxStatus limitedEdition strapSize caseSize includedAccessories " +
      "condition itemCondition category description visibility published featured inStock " +
      "badges images createdAt updatedAt publishSchedule"
    );

    res.status(201).json({
      success: true,
      message: "Product added successfully!",
      product: response,
    });
  } catch (error) {
    console.log("Add product error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
      details: error.errors,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID format",
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // 🔔 STORE OLD STOCK BEFORE UPDATE
    const oldStockQuantity = product.stockQuantity;

    console.log(`Updating product ${id}. Incoming stockQuantity:`, req.body.stockQuantity);

    // Handle images
    let updatedImages = [...(product.images || [])];
    if (req.body.images && req.body.images.length > 0) {
      updatedImages = req.body.images;
    } else if (req.body.uploadedImages) {
      const parsedImages = parseJSON(req.body.uploadedImages);
      if (parsedImages.length > 0) updatedImages = parsedImages;
    }

    // Generate product name
    const brand = req.body.brand || product.brand;
    const model = req.body.model || product.model;
    const productName = `${brand} ${model}`;

    // Stock & inStock
    let stockQuantity = req.body.stockQuantity !== undefined ? parseIntNum(req.body.stockQuantity) : product.stockQuantity;
    let inStock =
      req.body.stockQuantity !== undefined
        ? stockQuantity > 0
        : req.body.inStock !== undefined
          ? parseBoolean(req.body.inStock)
          : product.inStock;

    // Build updated fields safely
    const updatedFields = {
      name: productName,
      ...(req.body.brand && { brand: req.body.brand }),
      ...(req.body.model && { model: req.body.model }),
      ...(req.body.sku && { sku: req.body.sku }),
      ...(req.body.referenceNumber && { referenceNumber: req.body.referenceNumber }),
      ...(req.body.serialNumber && { serialNumber: req.body.serialNumber }),
      ...(req.body.additionalTitle && { additionalTitle: req.body.additionalTitle }),
      ...(req.body.watchType && { watchType: req.body.watchType }),
      ...(req.body.watchStyle && { watchStyle: req.body.watchStyle }),
      ...(req.body.scopeOfDeliveryWatch && {
        scopeOfDeliveryWatch: parseJSON(req.body.scopeOfDeliveryWatch),
      }),
      ...(req.body.includedAccessories && {
        includedAccessories: parseJSON(req.body.includedAccessories),
      }),
      ...(req.body.category && { category: req.body.category }),
      ...(req.body.condition && { condition: req.body.condition }),
      ...(req.body.itemCondition && { itemCondition: req.body.itemCondition }),
      ...(req.body.limitedEdition !== undefined && {
        limitedEdition: parseBoolean(req.body.limitedEdition),
      }),
      ...(req.body.productionYear && { productionYear: req.body.productionYear }),
      ...(req.body.approximateYear !== undefined && {
        approximateYear: parseBoolean(req.body.approximateYear),
      }),
      ...(req.body.unknownYear !== undefined && {
        unknownYear: parseBoolean(req.body.unknownYear),
      }),
      ...(req.body.deliveryDays !== undefined && {
        deliveryDays: parseIntNum(req.body.deliveryDays),
      }),
      ...(req.body.gender && { gender: req.body.gender }),
      ...(req.body.movement && { movement: req.body.movement }),

      // ✅ Safe enum handling for dialColor
      ...(req.body.dialColor !== undefined && req.body.dialColor.trim() !== '' && {
        dialColor: req.body.dialColor,
      }),

      ...(req.body.caseMaterial && { caseMaterial: req.body.caseMaterial }),
      ...(req.body.strapMaterial && { strapMaterial: req.body.strapMaterial }),
      ...(req.body.strapColor && req.body.strapColor.trim() !== '' && { strapColor: req.body.strapColor }),
      ...(req.body.badges && { badges: parseJSON(req.body.badges) }),
      ...(req.body.strapSize !== undefined && { strapSize: parseNumber(req.body.strapSize) }),
      ...(req.body.caseSize !== undefined && { caseSize: parseNumber(req.body.caseSize) }),
      ...(req.body.caseColor && req.body.caseColor.trim() !== '' && { caseColor: req.body.caseColor }),
      ...(req.body.crystal && { crystal: req.body.crystal }),
      ...(req.body.bezelMaterial && { bezelMaterial: req.body.bezelMaterial }),
      ...(req.body.dialNumerals && { dialNumerals: req.body.dialNumerals }),
      ...(req.body.caliber && { caliber: req.body.caliber }),
      ...(req.body.powerReserve !== undefined && { powerReserve: parseNumber(req.body.powerReserve) }),
      ...(req.body.jewels !== undefined && { jewels: parseIntNum(req.body.jewels) }),
      ...(req.body.functions && { functions: parseJSON(req.body.functions) }),
      ...(req.body.replacementParts && { replacementParts: parseJSON(req.body.replacementParts) }),
      ...(req.body.regularPrice !== undefined && { regularPrice: parseNumber(req.body.regularPrice) }),
      ...(req.body.salePrice !== undefined && { salePrice: parseNumber(req.body.salePrice) }),
      ...(req.body.taxStatus && { taxStatus: req.body.taxStatus }),
      stockQuantity,
      inStock,
      ...(req.body.description && { description: req.body.description }),
      ...(req.body.visibility && { visibility: req.body.visibility }),
      ...(req.body.seoTitle && { seoTitle: req.body.seoTitle }),
      ...(req.body.seoDescription && { seoDescription: req.body.seoDescription }),
      ...(req.body.seoKeywords && { seoKeywords: parseJSON(req.body.seoKeywords) }),
      ...(req.body.published !== undefined && { published: parseBoolean(req.body.published) }),
      ...(req.body.featured !== undefined && { featured: parseBoolean(req.body.featured) }),
      images: updatedImages,
      ...(req.body.meta && { meta: req.body.meta }),
      ...(req.body.attributes && { attributes: req.body.attributes }),

      // Make Offer System Updates
      ...(req.body.make_offer_enabled !== undefined && { make_offer_enabled: parseBoolean(req.body.make_offer_enabled) }),
      ...(req.body.minimum_offer_type !== undefined && { minimum_offer_type: req.body.minimum_offer_type }),
      ...(req.body.minimum_offer_percentage !== undefined && { minimum_offer_percentage: parseNumber(req.body.minimum_offer_percentage) }),
      ...(req.body.minimum_offer_amount !== undefined && { minimum_offer_amount: parseNumber(req.body.minimum_offer_amount) }),
      ...(req.body.suggested_offer_percentages !== undefined && { suggested_offer_percentages: parseJSON(req.body.suggested_offer_percentages) }),
      ...(req.body.acceptance_probability_rules !== undefined && { acceptance_probability_rules: parseJSON(req.body.acceptance_probability_rules) }),
      ...(req.body.auto_counter_offer_threshold !== undefined && { auto_counter_offer_threshold: parseNumber(req.body.auto_counter_offer_threshold) }),
      ...(req.body.offer_expiration_time !== undefined && { offer_expiration_time: parseIntNum(req.body.offer_expiration_time) }),

      // Support for publishSchedule updates (including dot notation from frontend)
      ...(req.body.publishSchedule && { publishSchedule: req.body.publishSchedule }),
      ...(req.body['publishSchedule.status'] && { 'publishSchedule.status': req.body['publishSchedule.status'] }),
      ...(req.body['publishSchedule.publishDate'] && { 'publishSchedule.publishDate': req.body['publishSchedule.publishDate'] }),
      ...(req.body['publishSchedule.scheduledPublish'] !== undefined && {
        'publishSchedule.scheduledPublish': parseBoolean(req.body['publishSchedule.scheduledPublish'])
      }),

      updatedAt: new Date(),
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updatedFields, {
      new: true,
      runValidators: true,
    });


    if (oldStockQuantity === 0 && updatedProduct.stockQuantity > 0) {
      await notifyRestock(updatedProduct._id);
    }


    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.log("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating product",
      error: error.message,
    });
  }
};

// =============================
// ⭐ GET ALL LIMITED EDITION PRODUCTS ⭐
// =============================

const getLimitedEditionProducts = async (req, res) => {
  try {
    const products = await Product.find({
      limitedEdition: true,
    }).select(
      "brand model name regularPrice salePrice images limitedEdition category inStock createdAt"
    );

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.log("Limited edition fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch limited edition products",
    });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    // Luxury items are often low quantity by nature, but 5 is a safe threshold for "low"
    const products = await Product.find({
      $or: [
        { stockQuantity: { $lte: 5 } },
        { inStock: false }
      ]
    }).select(
      "brand model name sku stockQuantity category inStock images updatedAt"
    ).sort({ stockQuantity: 1 });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.log("Low stock fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch low stock products",
    });
  }
};

const getDeadStockProducts = async (req, res) => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const products = await Product.find({
      stockQuantity: { $gt: 0 },
      updatedAt: { $lte: ninetyDaysAgo }
    }).select(
      "brand model name sku stockQuantity salePrice regularPrice category inStock images updatedAt createdAt"
    ).sort({ updatedAt: 1 });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.log("Dead stock fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dead stock products",
    });
  }
};

module.exports = {
  addProduct,
  deleteProduct,
  updateProduct,
  getLimitedEditionProducts,
  getLowStockProducts,
  getDeadStockProducts
};
