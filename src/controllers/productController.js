const Product = require("../models/product");
const RestockSubscription = require("../models/RestockSubscription");
const WatchService = require("../models/repairserviceModal");
const mongoose = require("mongoose")
const InventoryStock = require("../models/InventoryStockModel");
const { brandList } = require("../models/constants");


// Move selected products to inventory
const moveToInventory = async (req, res) => {
  try {
    let { productId } = req.body;

    // ✅ Accept single ID or array
    if (!productId) {
      return res.status(400).json({ message: "Product IDs required" });
    }

    // Convert single ID → array
    if (!Array.isArray(productId)) {
      productId = [productId];
    }

    const moved = [];
    const skipped = [];

    for (const id of productId) {
      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        skipped.push(id);
        continue;
      }

      const product = await Product.findById(id).lean();

      if (!product) {
        skipped.push(id);
        continue;
      }

      // Check inventory existence (better: SKU)
      const exists = await InventoryStock.findOne({
        internalCode: product.sku,
      });

      if (exists) {
        skipped.push(id);
        continue;
      }

      // Enum-safe brand
      const allowedBrand = brandList.includes(product.brand)
        ? product.brand
        : undefined;

      const inventoryItem = await InventoryStock.create({
        productName: product.name,
        brand: allowedBrand,
        internalCode: product.sku || "",
        quantity: product.stockQuantity || 1,
        sellingPrice: product.salePrice || 0,
        status: "AVAILABLE",
        addedBy: req.admin?._id,
      });

      moved.push(inventoryItem);
    }

    return res.json({
      message: "Move to inventory completed",
      movedCount: moved.length,
      skippedCount: skipped.length,
    });

  } catch (err) {
    console.error("Inventory move error:", err);
    return res.status(500).json({
      message: "Inventory move failed",
      error: err.message, // 🔥 helpful for debugging
    });
  }
};




const getProducts = async (req, res) => {
  try {
    const {
      id,
      page = 1,
      limit = 15,
      category,
      brand,
      model,
      price,
      availability,
      gender,
      condition,
      itemCondition,
      scopeOfDelivery,
      badges,
      search,
      minPrice,
      maxPrice,
      sortBy = "createdAt",
      sortOrder = "desc",
      featured,
      referenceNumber,
      // Advanced filters
      type,
      dialColor,
      caseColor,
      strapColor,
      strapMaterial,
      caseMaterial,
      caseSize,
      strapSize,
      yearOfProduction,
      waterResistance,
      movement,
      complications,
      crystal,
      includedAccessories,
    } = req.query;

    // ✅ Single Product by ID
    if (id) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: "❌ Product not found" });
      }
      return res.json(product);
    }

    // ✅ Convert pagination params
    const pageNum = Math.max(1, parseInt(page, 10));
    // If searching, allow a much larger limit for "View All" scenarios, otherwise use provided or default limit
    const limitNum = search ? 1000 : Math.min(200, Math.max(1, parseInt(limit, 10)));

    // ✅ Base Filter - only published products
    const filterQuery = {
      published: true,
    };
    const andConditions = [];

    // 🔹 Helper to normalize comma-separated or array inputs
    const normalizeArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    };

    // ✅ Category Filter
    const categoryList = normalizeArray(category);
    if (categoryList.length > 0) {
      andConditions.push({
        category: { $in: categoryList.map((cat) => new RegExp(cat, "i")) },
      });
    }

    // ✅ Brand Filter
    const brandList = normalizeArray(brand);
    if (brandList.length > 0) {
      andConditions.push({
        brand: { $in: brandList.map((br) => new RegExp(br, "i")) },
      });
    }

    // ✅ Model Filter
    const modelList = normalizeArray(model);
    if (modelList.length > 0) {
      andConditions.push({
        model: { $in: modelList.map((m) => new RegExp(m, "i")) },
      });
    }

    // ✅ Reference Number Filter
    const referenceNumberList = normalizeArray(referenceNumber);
    if (referenceNumberList.length > 0) {
      andConditions.push({
        referenceNumber: {
          $in: referenceNumberList.map((ref) => new RegExp(ref, "i")),
        },
      });
    }

    // ✅ Type Filter (Watch Type)
    const typeList = normalizeArray(type);
    if (typeList.length > 0) {
      andConditions.push({
        watchType: { $in: typeList.map((t) => new RegExp(t, "i")) },
      });
    }

    // ✅ Price Filter
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);
      andConditions.push({ salePrice: priceFilter });
    } else {
      const priceList = normalizeArray(price);
      if (priceList.length > 0) {
        const priceConditions = [];
        priceList.forEach((range) => {
          const [min, max] = range.split("-").map(Number);
          if (!isNaN(min) && !isNaN(max)) {
            priceConditions.push({ salePrice: { $gte: min, $lte: max } });
          } else if (!isNaN(min)) {
            priceConditions.push({ salePrice: { $gte: min } });
          } else if (!isNaN(max)) {
            priceConditions.push({ salePrice: { $lte: max } });
          }
        });
        if (priceConditions.length > 0) {
          andConditions.push({ $or: priceConditions });
        }
      }
    }

    // ✅ Availability Filter
    const availList = normalizeArray(availability);
    if (availList.length > 0) {
      const hasInStock = availList.includes("in_stock");
      const hasOutOfStock = availList.includes("out_of_stock");

      if (hasInStock && !hasOutOfStock) {
        andConditions.push({
          $or: [{ stockQuantity: { $gt: 0 } }, { inStock: true }],
        });
      } else if (hasOutOfStock && !hasInStock) {
        andConditions.push({
          $or: [{ stockQuantity: { $lte: 0 } }, { inStock: false }],
        });
      }
    }

    // ✅ Gender Filter
    const genderList = normalizeArray(gender);
    if (genderList.length > 0) {
      andConditions.push({
        gender: { $in: genderList.map((g) => new RegExp(g, "i")) },
      });
    }

    // ✅ Condition Filter
    const conditionList = normalizeArray(condition);
    if (conditionList.length > 0) {
      andConditions.push({
        condition: { $in: conditionList.map((c) => new RegExp(c, "i")) },
      });
    }

    // ✅ Item Condition Filter
    const itemConditionList = normalizeArray(itemCondition);
    if (itemConditionList.length > 0) {
      andConditions.push({
        itemCondition: {
          $in: itemConditionList.map((ic) => new RegExp(ic, "i")),
        },
      });
    }

    // ✅ Scope of Delivery Filter
    const scopeList = normalizeArray(scopeOfDelivery);
    if (scopeList.length > 0) {
      andConditions.push({
        scopeOfDelivery: {
          $in: scopeList.map((scope) => new RegExp(scope, "i")),
        },
      });
    }

    // ✅ Badges Filter
    const badgesList = normalizeArray(badges);
    if (badgesList.length > 0) {
      andConditions.push({
        badges: {
          $all: badgesList.map((badge) => new RegExp(badge, "i")),
        },
      });
    }

    // ✅ Featured Filter
    if (featured !== undefined) {
      andConditions.push({
        featured: featured === "true" || featured === true,
      });
    }

    // ✅ Advanced Filters

    // Dial Color Filter
    const dialColorList = normalizeArray(dialColor);
    if (dialColorList.length > 0) {
      andConditions.push({
        dialColor: {
          $in: dialColorList.map((color) => new RegExp(color, "i")),
        },
      });
    }

    // Case Color Filter
    const caseColorList = normalizeArray(caseColor);
    if (caseColorList.length > 0) {
      andConditions.push({
        caseColor: {
          $in: caseColorList.map((color) => new RegExp(color, "i")),
        },
      });
    }

    // Strap Color Filter
    const strapColorList = normalizeArray(strapColor);
    if (strapColorList.length > 0) {
      andConditions.push({
        strapColor: {
          $in: strapColorList.map((color) => new RegExp(color, "i")),
        },
      });
    }

    // Strap Material Filter
    const strapMaterialList = normalizeArray(strapMaterial);
    if (strapMaterialList.length > 0) {
      andConditions.push({
        strapMaterial: {
          $in: strapMaterialList.map((material) => new RegExp(material, "i")),
        },
      });
    }

    // Case Material Filter
    const caseMaterialList = normalizeArray(caseMaterial);
    if (caseMaterialList.length > 0) {
      andConditions.push({
        caseMaterial: {
          $in: caseMaterialList.map((material) => new RegExp(material, "i")),
        },
      });
    }

    // Case Size Filter
    const caseSizeList = normalizeArray(caseSize);
    if (caseSizeList.length > 0) {
      const caseSizeConditions = [];
      caseSizeList.forEach((range) => {
        const [min, max] = range.split("-").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          caseSizeConditions.push({ caseSize: { $gte: min, $lte: max } });
        } else if (range.includes("+")) {
          const minSize = parseInt(range.replace("+", ""));
          if (!isNaN(minSize)) {
            caseSizeConditions.push({ caseSize: { $gte: minSize } });
          }
        }
      });
      if (caseSizeConditions.length > 0) {
        andConditions.push({ $or: caseSizeConditions });
      }
    }

    // Strap Size Filter
    const strapSizeList = normalizeArray(strapSize);
    if (strapSizeList.length > 0) {
      const strapSizeConditions = [];
      strapSizeList.forEach((range) => {
        const [min, max] = range.split("-").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          strapSizeConditions.push({ strapSize: { $gte: min, $lte: max } });
        }
      });
      if (strapSizeConditions.length > 0) {
        andConditions.push({ $or: strapSizeConditions });
      }
    }

    // Year of Production Filter
    const yearList = normalizeArray(yearOfProduction);
    if (yearList.length > 0) {
      const yearConditions = [];
      yearList.forEach((range) => {
        if (range === "pre_1950") {
          yearConditions.push({ productionYear: { $lt: 1950 } });
        } else {
          const [min, max] = range.split("-").map(Number);
          if (!isNaN(min) && !isNaN(max)) {
            yearConditions.push({ productionYear: { $gte: min, $lte: max } });
          }
        }
      });
      if (yearConditions.length > 0) {
        andConditions.push({ $or: yearConditions });
      }
    }

    // Water Resistance Filter
    const waterResistanceList = normalizeArray(waterResistance);
    if (waterResistanceList.length > 0) {
      andConditions.push({
        waterResistance: {
          $in: waterResistanceList.map((wr) => new RegExp(wr, "i")),
        },
      });
    }

    // Movement Filter
    const movementList = normalizeArray(movement);
    if (movementList.length > 0) {
      andConditions.push({
        movement: { $in: movementList.map((mov) => new RegExp(mov, "i")) },
      });
    }

    // Complications Filter
    const complicationsList = normalizeArray(complications);
    if (complicationsList.length > 0) {
      andConditions.push({
        complications: {
          $in: complicationsList.map((comp) => new RegExp(comp, "i")),
        },
      });
    }

    // Crystal Filter
    const crystalList = normalizeArray(crystal);
    if (crystalList.length > 0) {
      andConditions.push({
        crystal: { $in: crystalList.map((cryst) => new RegExp(cryst, "i")) },
      });
    }

    // Included Accessories Filter
    const accessoriesList = normalizeArray(includedAccessories);
    if (accessoriesList.length > 0) {
      andConditions.push({
        includedAccessories: {
          $in: accessoriesList.map((acc) => new RegExp(acc, "i")),
        },
      });
    }

    // ✅ Search Filter
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      andConditions.push({
        $or: [
          { name: searchRegex },
          { brand: searchRegex },
          { model: searchRegex },
          { description: searchRegex },
          { referenceNumber: searchRegex },
        ],
      });
    }

    // ✅ Merge all AND filters
    if (andConditions.length > 0) {
      filterQuery.$and = andConditions;
    }

    // ✅ Sort configuration
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_low_high: { salePrice: 1 },
      price_high_low: { salePrice: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
      featured: { featured: -1, createdAt: -1 },
      rating: { rating: -1 },
      discount: { discountPercentage: -1 },
    };

    const sortObj = sortOptions[sortBy] || { createdAt: -1 };
    if (sortOrder === "asc" && sortObj[Object.keys(sortObj)[0]]) {
      sortObj[Object.keys(sortObj)[0]] = 1;
    }

    // ✅ Count total
    const totalProducts = await Product.countDocuments(filterQuery);

    if (totalProducts === 0) {
      return res.json({
        totalProducts: 0,
        totalPages: 0,
        currentPage: pageNum,
        products: [],
        message: "No products found",
      });
    }

    // ✅ Query products
    const products = await Product.find(filterQuery)
      .select(
        "brand name regularPrice salePrice stockQuantity inStock " +
        "condition category leatherMainCategory subCategory " +
        "images limitedEdition badges featured createdAt"
      )
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const totalPages = Math.ceil(totalProducts / limitNum);

    // ✅ Format response
    const formattedProducts = products.map((p) => ({
      _id: p._id,
      brand: p.brand || "",
      name: p.name,
      regularPrice: p.regularPrice ?? 0,
      salePrice: p.salePrice ?? 0,
      image:
        p.images?.find((img) => img.type === "main")?.url ||
        p.images?.[0]?.url ||
        null,
      category: p.category || "",
      leatherMainCategory: p.leatherMainCategory || null,
      subCategory: p.subCategory || null,
      inStock: p.stockQuantity > 0 || p.inStock,
      condition: p.condition || null,
      limitedEdition: p.limitedEdition || false,
      badges: p.badges || [],
      featured: p.featured || false,
    }));

    res.json({
      totalProducts,
      totalPages,
      currentPage: pageNum,
      products: formattedProducts,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null,
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({
      message: "❌ Error fetching products",
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    });
  }
};


const getAllBrands = async (req, res) => {
  try {
    const brands = await Product.aggregate([
      {
        $match: {
          published: true,
          category: { $regex: /^Leather Bags$/i },
          brand: { $exists: true, $ne: "" },
        },
      },

      // Normalize brand
      {
        $project: {
          cleanBrand: {
            $trim: {
              input: { $toLower: "$brand" },
            },
          },
        },
      },

      // Group by normalized brand
      {
        $group: {
          _id: "$cleanBrand",
        },
      },

      // Sort A-Z
      {
        $sort: { _id: 1 },
      },
    ]);

    // Capitalize for frontend display
    const formattedBrands = brands.map((b) => ({
      name: b._id
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    }));

    res.json({
      totalBrands: formattedBrands.length,
      brands: formattedBrands.map((b) => b.name),
    });
  } catch (error) {
    console.error("❌ Error fetching brands:", error);
    res.status(500).json({ message: "Error fetching brands" });
  }
};




const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ REQUIRED FIX
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "❌ Invalid product ID",
      });
    }

    const product = await Product.findById(id)
      .select(
        "brand model name sku referenceNumber serialNumber watchType watchStyle " +
        "scopeOfDelivery scopeOfDeliveryWatch productionYear gender movement " +
        "dialColor caseMaterial strapMaterial strapColor dialNumerals " +
        "salePrice regularPrice stockQuantity taxStatus strapSize caseSize " +
        "includedAccessories condition itemCondition category description " +
        "visibility published featured inStock badges images createdAt updatedAt " +
        "waterResistance complications crystal limitedEdition"
      )
      .lean();

    if (!product || !product.published) {
      return res.status(404).json({
        message: "❌ Product not found",
      });
    }

    const formattedProduct = {
      ...product,
      brand: product.brand || "",
      category: product.category || "",
      image:
        product.images?.find((img) => img.type === "main")?.url ||
        product.images?.[0]?.url ||
        "",
      available: product.stockQuantity > 0 || product.inStock,
      discount:
        product.regularPrice &&
          product.salePrice &&
          product.regularPrice > product.salePrice
          ? Math.round(
            ((product.regularPrice - product.salePrice) /
              product.regularPrice) *
            100
          )
          : 0,
      isOnSale:
        product.regularPrice &&
        product.salePrice &&
        product.regularPrice > product.salePrice,
    };

    return res.status(200).json(formattedProduct);
  } catch (err) {
    console.error("❌ Error fetching product by ID:", err);
    return res.status(500).json({
      message: "❌ Error fetching product",
    });
  }
};

// Add Product
const addProduct = async (req, res) => {
  try {
    const productData = req.body;

    if (!productData.name) {
      return res.status(400).json({ message: "Product name is required." });
    }

    // Parse stringified JSON fields
    const parseJSON = (field) => {
      if (!field) return undefined;
      try {
        return typeof field === "string" ? JSON.parse(field) : field;
      } catch {
        return field;
      }
    };

    const newProduct = new Product({
      ...productData,
      subcategory: parseJSON(productData.subcategory),
      brands: parseJSON(productData.brands),
      tags: parseJSON(productData.tags),
      attributes: parseJSON(productData.attributes),
      images: req.body.images || [], // already array from upload middleware
    });

    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error("Add product error:", error);
    res.status(500).json({ error: error.message });
  }
};

// 📌 Add Service Form (Create new booking)
const addServiceForm = async (req, res) => {
  try {
    const {
      customerName,
      phoneNumber,
      countryCode, // optional, default +971 will be applied by schema
      productName,
      manufactureYear,
      watchType,
      selectedService,
      images, // optional (can be a URL or base64)
    } = req.body;

    // 🔹 Validate required fields
    if (!customerName || !phoneNumber || !productName || !selectedService) {
      return res.status(400).json({
        success: false,
        message:
          "Customer name, phone number, product name, and service type are required",
      });
    }

    // 🔹 Create new booking
    const newBooking = new WatchService({
      customerName,
      phoneNumber,
      countryCode, // will use default if not provided
      productName,
      manufactureYear,
      watchType,
      selectedService,
      images,
    });

    await newBooking.save();

    res.status(201).json({
      success: true,
      message: "Service booked successfully",
      data: newBooking,
    });
  } catch (error) {
    console.log("❌ Error creating service booking:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getBrandWatches = async (req, res) => {
  try {
    const { brand } = req.params;

    // Find all watches for the brand
    const products = await Product.find({
      brand: { $regex: new RegExp(`^${brand}$`, "i") }, // case-insensitive
      category: "Watch", // only watches
    });

    if (!products || products.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No watches found for brand: ${brand}`,
      });
    }

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


const getBrandBags = async (req, res) => {
  try {
    // Trim the brand from URL params to avoid accidental spaces
    const brandParam = req.params.brand.trim();

    // Find all products for the brand (case-insensitive, ignores extra spaces)
    const products = await Product.find({
      brand: { $regex: brandParam, $options: "i" }, // case-insensitive match
      leatherMainCategory: "Bag", // Only bags
    });

    if (!products || products.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No bags found for brand: ${brandParam}`,
      });
    }

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


const getBrandAccessories = async (req, res) => {
  try {
    const brandParam = req.params.brand.trim();

    const products = await Product.find({
      brand: { $regex: new RegExp(`^${brandParam}$`, "i") },
      category: "Accessories",
    });

    if (!products?.length) {
      return res.status(404).json({
        success: false,
        message: `No accessories found for brand: ${brandParam}`,
      });
    }

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


const productHome = async (req, res) => {
  try {
    // Fetch last-added products (LIFO order) using createdAt timestamp
    const brandNew = await Product.find()
      .sort({ createdAt: 1 })
      .skip(2) // newest first
      .limit(6);

    const newArrivals = await Product.find()
      .sort({ createdAt: -1 })
      .skip(19)
      .limit(3);

    const montresTrusted = await Product.find()
      .sort({ createdAt: -1 })
      .skip(8)
      .limit(3);

    const lastBrandNew = await Product.find()
      .sort({ createdAt: -1 })
      .skip(12)
      .limit(6);

    res.json({
      brandNew,
      newArrivals,
      montresTrusted,
      lastBrandNew,
    });
  } catch (err) {
    res.status(500).json({
      message: "❌ Error fetching home products",
      error: err.message,
    });
  }
};

// 📌 Get all service bookings
const getBookingService = async (req, res) => {
  try {
    // Optionally, you could filter by query params, e.g., ?watchType=Luxury
    const { watchType, selectedService } = req.query;

    // Build query object dynamically
    let query = {};
    if (watchType) query.watchType = watchType;
    if (selectedService) query.selectedService = selectedService;

    const bookings = await WatchService.find(query).sort({ createdAt: -1 }); // latest first

    res.status(200).json({
      success: true,
      message: "Service bookings retrieved successfully",
      data: bookings,
    });
  } catch (error) {
    console.log("❌ Error fetching service bookings:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


const restockSubscribe = async (req, res) => {
  const { id } = req.params; // productId
  const { email, customerName, phone } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  try {
    // Get product info
    const product = await Product.findById(id)
      .select("name category sku");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Prevent duplicate entry
    const existing = await RestockSubscription.findOne({
      productId: product._id,
      email,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You are already subscribed for this product",
      });
    }

    const subscription = new RestockSubscription({
      productId: product._id,
      productName: product.name,
      category: product.category,
      productSKU: product.sku || null,

      customerName: customerName || "",
      email,
      phone: phone || "",

      requestType: "restock",
      status: "pending",
      notified: false,
      exportedToCSV: false,
    });

    await subscription.save();

    res.json({
      success: true,
      message: "Customer added to restock / request list",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


const getRestockSubscribers = async (req, res) => {
  try {
    const { productId } = req.query;

    let query = {};
    if (productId) query.productId = productId;

    const subscriptions = await RestockSubscription.find(query)
      .sort({ createdAt: -1 })
      .populate({
        path: "productId",
        select: "name sku category image images mainImage", // choose relevant fields
      })
      .lean();

    const subscribers = subscriptions.map(s => ({
      ...s,
      productName: s.productId?.name || null,
      productSKU: s.productId?.sku || null,
      category: s.productId?.category || null,
      productImage:
        s.productId?.image ||
        s.productId?.mainImage ||
        s.productId?.images?.[0] ||
        null,
    }));

    res.json({
      success: true,
      total: subscribers.length,
      subscribers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const unsubscribeRestock = async (req, res) => {
  const { id } = req.params; // productId from URL
  const { email } = req.body; // Email comes from request body

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required to unsubscribe",
    });
  }

  try {
    // Find and delete the subscription
    const result = await RestockSubscription.findOneAndDelete({
      productId: id, // ✅ use id from params
      email,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    res.json({
      success: true,
      message: "Unsubscribed successfully",
    });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while unsubscribing",
    });
  }
};




const getRecommendations = async (cartItems, limit = 4) => {
  try {
    const cartProductIds = cartItems.map((item) => item.productId);

    if (cartProductIds.length === 0) {
      // Fallback: random watches
      return Product.aggregate([
        { $match: { categorisOne: "watch" } },
        { $sample: { size: limit } },
        { $project: { name: 1, images: 1, salePrice: 1, regularPrice: 1 } },
      ]);
    }

    // Fetch recommended products in one aggregation
    const recommended = await Product.aggregate([
      {
        $match: {
          _id: { $nin: cartProductIds }, // exclude cart items
          $or: [
            {
              categorisOne: {
                $in: cartItems.map((i) => i.categorisOne).filter(Boolean),
              },
            },
            {
              subcategory: {
                $in: cartItems.flatMap((i) => i.subcategory).filter(Boolean),
              },
            },
            {
              brands: {
                $in: cartItems.flatMap((i) => i.brands).filter(Boolean),
              },
            },
          ],
        },
      },
      { $sample: { size: limit } }, // random selection for variety
      { $project: { name: 1, images: 1, salePrice: 1, regularPrice: 1 } },
    ]);

    // If not enough recommendations, fallback to random watches
    if (!recommended || recommended.length === 0) {
      return Product.aggregate([
        { $match: { categorisOne: "watch" } },
        { $sample: { size: limit } },
        { $project: { name: 1, images: 1, salePrice: 1, regularPrice: 1 } },
      ]);
    }

    return recommended;
  } catch (err) {
    console.error("Recommendation Service Error:", err);
    throw new Error("Error fetching recommendations");
  }
};

const Fuse = require("fuse.js");

const SEARCH_SELECT =
  "brand name regularPrice salePrice images category leatherMainCategory " +
  "subcategory referenceNumber inStock stockQuantity model " +
  "accessoryCategory accessorySubCategory watchType watchStyle leatherSubCategory";

const SEARCH_STOCK_FILTER = {
  published: true,
};

const FUSE_OPTIONS = {
  keys: [
    { name: "brand", weight: 0.4 },
    { name: "name", weight: 0.35 },
    { name: "model", weight: 0.15 },
    { name: "referenceNumber", weight: 0.1 },
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 2,
};

const getAllProductwithSearch = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const trimmed = search.trim();

    if (trimmed) {
      // Robust Search: Regex for brand, name, and model to handle partial matches and word boundaries correctly
      const searchRegex = { $regex: trimmed, $options: "i" };
      const query = {
        ...SEARCH_STOCK_FILTER,
        $or: [
          { brand: searchRegex },
          { name: searchRegex },
          { model: searchRegex },
          { referenceNumber: searchRegex },
        ]
      };

      const results = await Product.find(query)
        .select(SEARCH_SELECT)
        .limit(1000)
        .lean();
      
      console.log(`[BackendAllDebug] search for '${trimmed}' found: ${results.length}`);

      return res.json({ success: true, totalProducts: results.length, products: results });
    }

    // No search term — return full catalog for client-side search (Navbar preload)
    const products = await Product.find(SEARCH_STOCK_FILTER)
      .select(SEARCH_SELECT)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, totalProducts: products.length, products });
  } catch (error) {
    console.error("Product fetch error: ", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
};

const SimilarProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) return res.status(404).json({ message: "Product not found" });

    const similarProducts = await Product.find({
      _id: { $ne: product._id },
      brand: product.brand,
      category: product.category,
      watchType: product.watchType,
      gender: product.gender,
      movement: product.movement,
      condition: product.condition,
    }).limit(10);

    res.status(200).json({
      success: true,
      products: similarProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const YouMayAlsoLike = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) return res.status(404).json({ message: "Product not found" });

    const suggestions = await Product.find({
      _id: { $ne: product._id },
      category: product.category, // broad match
      $or: [
        { featured: true }, // trending
        { discount: { $gte: 5 } }, // offers
        { brand: { $ne: product.brand } }, // DIFFERENT brand
      ],
    })
      .sort({ createdAt: -1 })
      .limit(12);

    res.status(200).json({
      success: true,
      products: suggestions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  addProduct,
  addServiceForm,
  productHome,
  getRecommendations,
  getAllProductwithSearch,
  restockSubscribe,
  SimilarProduct,
  YouMayAlsoLike,
  getBrandWatches,
  getBookingService,
  moveToInventory,
  getProductById,
  getBrandBags,
  getRestockSubscribers,
  unsubscribeRestock,
  getBrandAccessories,
  getAllBrands
};
