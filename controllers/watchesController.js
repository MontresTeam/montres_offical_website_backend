// controllers/watchesController.js
const Product = require("../models/product");

// Helper to normalize comma-separated or array inputs
const normalizeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(",").map((v) => v.trim()).filter(Boolean);
};

// Common Filter Builder
const buildWatchFilter = (query) => {
  const {
    minPrice,
    maxPrice,
    minYear,
    maxYear,
    brand,
    model,
    referenceNumber,
    gender,
    availability,
    condition,
    itemCondition,
    scopeOfDelivery,
    badges,
    type,
    watchType,
    dialColor,
    caseColor,
    strapColor,
    caseMaterial,
    strapMaterial,
    caseSize,
    movement,
    waterResistance,
    yearOfProduction,
    watchStyle
  } = query;

  const andConditions = [];

  // Apply basic filters
  const simpleFilters = {
    brand,
    model,
    referenceNumber,
    gender,
    condition,
    itemCondition,
    scopeOfDelivery,
    badges,
    dialColor,
    caseColor,
    strapColor,
    caseMaterial,
    strapMaterial,
    movement,
    waterResistance,
    watchStyle
  };

  Object.entries(simpleFilters).forEach(([key, value]) => {
    const list = normalizeArray(value);
    if (list.length > 0) {
      if (key === 'watchStyle') {
        // For watchStyle, allow partial matches (e.g., "Luxury" matches "luxury watch")
        const styleConditions = list.map(v => ({
          [key]: new RegExp(`^${v}( watch)?$`, 'i')
        }));
        andConditions.push({ $or: styleConditions });
      } else {
        andConditions.push({ [key]: { $in: list.map(v => new RegExp(`^${v}$`, 'i')) } });
      }
    }
  });

  // Handle Watch Type
  const combinedTypes = [...normalizeArray(type), ...normalizeArray(watchType)];
  if (combinedTypes.length > 0) {
    andConditions.push({
      watchType: { $in: combinedTypes.map(t => new RegExp(`^${t}$`, 'i')) }
    });
  }

  // Handle case size ranges
  const caseSizeList = normalizeArray(caseSize);
  if (caseSizeList.length > 0) {
    const caseSizeConditions = [];
    caseSizeList.forEach(range => {
      if (range.includes('-')) {
        const [min, max] = range.split("-").map(r => parseInt(r.replace('mm', '')));
        if (!isNaN(min) && !isNaN(max)) {
          caseSizeConditions.push({ caseSize: { $gte: min, $lte: max } });
        }
      } else if (range.includes('+')) {
        const minSize = parseInt(range.replace("+", "").replace('mm', ''));
        if (!isNaN(minSize)) {
          caseSizeConditions.push({ caseSize: { $gte: minSize } });
        }
      } else {
        const size = parseInt(range.replace('mm', ''));
        if (!isNaN(size)) {
          caseSizeConditions.push({ caseSize: size });
        }
      }
    });
    if (caseSizeConditions.length > 0) {
      andConditions.push({ $or: caseSizeConditions });
    }
  }

  // Handle production year range
  if (minYear || maxYear) {
    const yearFilter = {};
    if (minYear) yearFilter.$gte = minYear.toString();
    if (maxYear) yearFilter.$lte = maxYear.toString();
    andConditions.push({ productionYear: yearFilter });
  } else {
    const yearList = normalizeArray(yearOfProduction);
    if (yearList.length > 0) {
      const yearConditions = [];
      yearList.forEach(range => {
        if (range.includes('-')) {
          const [min, max] = range.split("-");
          yearConditions.push({ productionYear: { $gte: min, $lte: max } });
        } else {
          yearConditions.push({ productionYear: range });
        }
      });
      if (yearConditions.length > 0) {
        andConditions.push({ $or: yearConditions });
      }
    }
  }

  // Handle price range
  if (minPrice || maxPrice) {
    const priceFilter = {};
    if (minPrice) priceFilter.$gte = parseInt(minPrice);
    if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
    andConditions.push({ salePrice: priceFilter });
  }

  // Handle availability
  const availList = normalizeArray(availability);
  if (availList.length > 0) {
    const availabilityConditions = [];
    if (availList.some(a => a.toLowerCase() === 'in stock' || a.toLowerCase() === 'in_stock')) {
      availabilityConditions.push({ $or: [{ stockQuantity: { $gt: 0 } }, { inStock: true }] });
    }
    if (availList.some(a => a.toLowerCase() === 'sold out' || a.toLowerCase() === 'out_of_stock')) {
      availabilityConditions.push({ $or: [{ stockQuantity: { $lte: 0 } }, { inStock: false }] });
    }
    if (availabilityConditions.length > 0) {
      andConditions.push({ $or: availabilityConditions });
    }
  }

  return andConditions;
};

const getAllWatches = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 16,
      sortBy = "newest"
    } = req.query;

    let filter = { category: "Watch", published: true };
    const andConditions = buildWatchFilter(req.query);

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_low_high: { salePrice: 1 },
      price_high_low: { salePrice: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
      featured: { featured: -1, createdAt: -1 },
      'best-seller': { sold: -1, createdAt: -1 },
      rating: { rating: -1 },
      discount: { discountPercentage: -1 }
    };

    const sort = sortOptions[sortBy] || sortOptions.newest;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return res.json({
      totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products,
    });

  } catch (err) {
    console.error("Error fetching all watches:", err);
    res.status(500).json({
      message: "❌ Error fetching watches",
      error: err.message,
    });
  }
};

const getWatchesByStyle = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 16,
      sortBy = "newest"
    } = req.query;

    const { style } = req.params;

    let filter = { category: "Watch", published: true };

    if (style && style !== "all") {
      // Use case-insensitive regex and allow optional " watch" suffix
      filter.watchStyle = new RegExp(`^${style}( watch)?$`, "i");
    }

    const andConditions = buildWatchFilter(req.query);
    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_low_high: { salePrice: 1 },
      price_high_low: { salePrice: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
      featured: { featured: -1, createdAt: -1 },
      'best-seller': { sold: -1, createdAt: -1 },
      rating: { rating: -1 },
      discount: { discountPercentage: -1 }
    };

    const sort = sortOptions[sortBy] || sortOptions.newest;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return res.json({
      totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products,
    });

  } catch (err) {
    console.error("Error fetching watches by style:", err);
    res.status(500).json({
      message: "❌ Error fetching watches",
      error: err.message,
    });
  }
};

module.exports = { getAllWatches, getWatchesByStyle };