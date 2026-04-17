// controllers/watchesController.js
const Product = require("../models/product");

const getAllWatches = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 16,
      sortBy = "newest",
      minPrice,
      maxPrice,
      brand,
      model,
      referenceNumber,
      gender,
      availability,
      condition,
      itemCondition,
      scopeOfDelivery,
      badges,
      watchType,
      dialColor,
      strapColor,
      caseMaterial,
      strapMaterial,
      caseSize,
      movement,
      waterResistance
    } = req.query;

    // Base filter: only watches
    let filter = {
      category: "Watch",
    };

    // Build filter object dynamically
    const filterMappings = {
      brand: Array.isArray(brand) ? brand : brand?.split(','),
      model: Array.isArray(model) ? model : model?.split(','),
      referenceNumber: Array.isArray(referenceNumber) ? referenceNumber : referenceNumber?.split(','),
      gender: Array.isArray(gender) ? gender : gender?.split(','),
      availability: Array.isArray(availability) ? availability : availability?.split(','),
      condition: Array.isArray(condition) ? condition : condition?.split(','),
      itemCondition: Array.isArray(itemCondition) ? itemCondition : itemCondition?.split(','),
      scopeOfDelivery: Array.isArray(scopeOfDelivery) ? scopeOfDelivery : scopeOfDelivery?.split(','),
      badges: Array.isArray(badges) ? badges : badges?.split(','),
      watchType: Array.isArray(watchType) ? watchType : watchType?.split(','),
      dialColor: Array.isArray(dialColor) ? dialColor : dialColor?.split(','),
      strapColor: Array.isArray(strapColor) ? strapColor : strapColor?.split(','),
      caseMaterial: Array.isArray(caseMaterial) ? caseMaterial : caseMaterial?.split(','),
      strapMaterial: Array.isArray(strapMaterial) ? strapMaterial : strapMaterial?.split(','),
      movement: Array.isArray(movement) ? movement : movement?.split(','),
      waterResistance: Array.isArray(waterResistance) ? waterResistance : waterResistance?.split(',')
    };

    // Apply filters
    Object.entries(filterMappings).forEach(([key, value]) => {
      if (value && value.length > 0) {
        filter[key] = { $in: value };
      }
    });

    // Handle case size ranges
    if (caseSize) {
      const caseSizeRanges = Array.isArray(caseSize) ? caseSize : caseSize.split(',');
      const caseSizeConditions = caseSizeRanges.map(range => {
        switch (range) {
          case "28-32mm": return { caseSize: { $gte: 28, $lte: 32 } };
          case "33-36mm": return { caseSize: { $gte: 33, $lte: 36 } };
          case "37-39mm": return { caseSize: { $gte: 37, $lte: 39 } };
          case "40-42mm": return { caseSize: { $gte: 40, $lte: 42 } };
          case "43-45mm": return { caseSize: { $gte: 43, $lte: 45 } };
          case "46-48mm": return { caseSize: { $gte: 46, $lte: 48 } };
          case "49+": return { caseSize: { $gte: 49 } };
          default: return null;
        }
      }).filter(condition => condition !== null);

      if (caseSizeConditions.length > 0) {
        filter.$or = caseSizeConditions;
      }
    }

    // Handle price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseInt(minPrice);
      if (maxPrice) filter.price.$lte = parseInt(maxPrice);
    }

    // Sort options
    const sortOptions = {
      newest: { createdAt: -1 },
      price_low_high: { price: 1 },
      price_high_low: { price: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
      rating: { rating: -1 },
      discount: { discountPercentage: -1 }
    };

    const sort = sortOptions[sortBy] || sortOptions.newest;

    // Convert page/limit to numbers
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    // Count total products
    const totalProducts = await Product.countDocuments(filter);

    // Fetch paginated products
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
      sortBy = "newest",
      minPrice,
      maxPrice,
      brand,
      // Add other filter parameters as needed
    } = req.query;

    const { style } = req.params;

    // Base filter: only watches
    let filter = {
      category: "Watch",
    };

    // Filter by watchStyle if provided and not "all"
    if (style && style !== "all") {
      filter.watchStyle = style;
    }

    // Add the same filtering logic as getAllWatches here
    // ... (copy the filter building logic from getAllWatches)

    // Sort options (same as above)
    const sortOptions = {
      newest: { createdAt: -1 },
      price_low_high: { price: 1 },
      price_high_low: { price: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
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