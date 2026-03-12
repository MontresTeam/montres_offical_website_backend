const Product = require("../models/product");
const RestockSubscription = require("../models/RestockSubscription");
const WatchService = require("../models/repairserviceModal");
const mongoose = require("mongoose")
const InventoryStock = require("../models/InventoryStockModel");
const { brandList } = require("../models/constants");
const sendEmail = require("../utils/sendEmail");


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
      minYear,
      maxYear,
      waterResistance,
      movement,
      complications,
      crystal,
      includedAccessories,
      leatherMainCategory,
    } = req.query;

    // ✅ Single Product by ID
    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "❌ Invalid product ID",
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: "❌ Product not found" });
      }
      return res.json(product);
    }

    // ✅ Convert pagination params
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    // ✅ Base Filter - only published products
    const filterQuery = { published: true };
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
    const categoryList = normalizeArray(category).map(cat => {
      const lowerCat = cat.toLowerCase();
      if (lowerCat === 'watches' || lowerCat === 'watch') return 'Watch';
      if (lowerCat === 'accessories') return 'Accessories';
      return cat;
    });

    if (categoryList.length > 0) {
      andConditions.push({
        category: { $in: categoryList.map((cat) => new RegExp(`^${cat}$`, "i")) },
      });
    }

    // ✅ Brand Filter
    const selectedBrands = normalizeArray(brand);
    if (selectedBrands.length > 0) {
      andConditions.push({
        brand: { $in: selectedBrands.map((br) => new RegExp(`^${br.trim()}$`, "i")) },
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
    if (minYear || maxYear) {
      // Frontend sends minYear/maxYear directly
      const yearFilter = {};
      if (minYear) yearFilter.$gte = Number(minYear);
      if (maxYear) yearFilter.$lte = Number(maxYear);
      andConditions.push({ productionYear: yearFilter });
    } else {
      // Legacy range-string format (e.g. "1980-2000", "pre_1950")
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

    // ✅ Leather Main Category Filter
    if (leatherMainCategory) {
      andConditions.push({ leatherMainCategory: { $regex: new RegExp(`^${leatherMainCategory}$`, "i") } });
    }

    // ✅ Merge all AND filters
    if (andConditions.length > 0) {
      filterQuery.$and = andConditions;
    }

    // ✅ Sort configuration - always prioritize inStock
    const sortOptions = {
      newest: { inStock: -1, createdAt: -1 },
      oldest: { inStock: -1, createdAt: 1 },
      price_low_high: { inStock: -1, salePrice: 1 },
      price_high_low: { inStock: -1, salePrice: -1 },
      name_asc: { inStock: -1, name: 1 },
      name_desc: { inStock: -1, name: -1 },
      featured: { inStock: -1, featured: -1, createdAt: -1 },
      'best-seller': { inStock: -1, sold: -1, createdAt: -1 },
      rating: { inStock: -1, rating: -1 },
      discount: { inStock: -1, discountPercentage: -1 },
    };

    const sortObj = sortOptions[sortBy] || { inStock: -1, createdAt: -1 };
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
        "brand name regularPrice salePrice stockQuantity inStock sku " +
        "condition category leatherMainCategory subCategory " +
        "images limitedEdition badges featured createdAt updatedAt publishSchedule"
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
      sku: p.sku || "",
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
      stockQuantity: p.stockQuantity || 0,
      condition: p.condition || null,
      limitedEdition: p.limitedEdition || false,
      badges: p.badges || [],
      featured: p.featured || false,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      publishSchedule: p.publishSchedule || { status: 'published', scheduledPublish: false },
    }));

    res.json({
      success: true,
      totalProducts,
      count: totalProducts, // Aliasing for compatibility with specific brand endpoints
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
    const { category } = req.query;

    // Build match condition based on category
    let matchCondition = {
      published: true,
      brand: { $exists: true, $ne: "" },
    };

    // Apply category-specific filters
    if (category) {
      const categoryLower = category.toLowerCase();

      if (categoryLower === 'watches' || categoryLower === 'watch') {
        matchCondition.category = "Watch";
      } else if (categoryLower === 'bags' || categoryLower === 'handbags' || categoryLower === 'leather-bags') {
        matchCondition.$or = [
          { category: "Leather Bags" },
          { category: "Leather Goods", leatherMainCategory: "Bag" }
        ];
      } else if (categoryLower === 'accessories') {
        matchCondition.category = "Accessories";
      } else {
        // If specific category provided, use it
        matchCondition.category = { $regex: new RegExp(`^${category}$`, 'i') };
      }
    }

    const brands = await Product.aggregate([
      {
        $match: matchCondition,
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
      category: category || 'all'
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
      email,
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
      email: email || undefined,
      countryCode: countryCode || "+971",
      productName,
      manufactureYear: manufactureYear || undefined,
      watchType: watchType || undefined,
      selectedService,
      images,
    });

    await newBooking.save();

    // 📩 Send Email Notification to Admin & Sales
    const adminEmails = ["admin@montres.ae", "sales@montres.ae"];
    const adminSubject = `New Watch Service Booking: ${selectedService}`;
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #000; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Montres Trading L.L.C – Watch Service Booking</h2>
        <p><strong>New Watch Service Request Received</strong></p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 5px; font-weight: bold; width: 150px;">Customer Name:</td><td style="padding: 5px;">${customerName}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Email:</td><td style="padding: 5px;">${email || "Not Provided"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Phone:</td><td style="padding: 5px;">${countryCode || "+971"} ${phoneNumber}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Watch Model:</td><td style="padding: 5px;">${productName}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Watch Type:</td><td style="padding: 5px;">${watchType || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Year:</td><td style="padding: 5px;">${manufactureYear || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Service Requested:</td><td style="padding: 5px;">${selectedService}</td></tr>
        </table>

        ${images && images.length > 0 ? `<p><strong>Attached Images:</strong> ${images.length} file(s) provided.</p>` : ""}
        
        <footer style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
          <p>Sent from Montres Store (www.montres.ae)</p>
        </footer>
      </div>
    `;
    const adminText = `New Watch Service Booking:\nCustomer: ${customerName}\nEmail: ${email}\nPhone: ${countryCode || "+971"} ${phoneNumber}\nWatch: ${productName}\nService: ${selectedService}`;

    // 📩 Customer Confirmation Email
    const customerSubject = "Service Booking Confirmation - Montres Trading L.L.C";
    const customerHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #000;">Thank You for Choosing Montres Trading L.L.C</h2>
        <p>Dear ${customerName},</p>
        <p>We have received your service booking request for your <strong>${productName}</strong>. Our specialists will review your request and contact you shortly regarding the next steps.</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #eee; margin: 20px 0;">
          <p><strong>Booking Details:</strong></p>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Service:</strong> ${selectedService}</li>
            <li><strong>Watch:</strong> ${productName}</li>
            <li><strong>Status:</strong> Pending</li>
          </ul>
        </div>

        <p>If you have any urgent questions, please feel free to reply to this email or contact us directly.</p>
        
        <footer style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
          <p>Montres Trading L.L.C – The Art Of Time</p>
          <p>www.montres.ae | +971 50 123 4567</p>
        </footer>
      </div>
    `;
    const customerText = `Dear ${customerName},\n\nWe have received your service booking request for your ${productName} (${selectedService}). Our specialists will contact you shortly.\n\nThank you for choosing Montres Trading L.L.C.`;

    // Send emails in parallel
    try {
      const emailPromises = [
        ...adminEmails.map((adminEmail) => sendEmail(adminEmail, adminSubject, adminHtml, adminText))
      ];

      // Only send customer email if email is provided
      if (email) {
        emailPromises.push(sendEmail(email, customerSubject, customerHtml, customerText));
      }

      await Promise.all(emailPromises);
    } catch (emailError) {
      console.error("❌ Email notification failed:", emailError);
      // We don't fail the whole request if email fails, as the booking is already saved
    }

    res.status(201).json({
      success: true,
      message: "Service booked successfully. A confirmation email has been sent.",
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
    const brandName = decodeURIComponent(req.params.brand);
    const { page = 1, limit = 16, sortBy = "featured" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    // Normalize brand naming variations (e.g., handling typos in URL slugs or DB)
    // We make 'arpels' and 'arels' interchangeable and treat spaces/hyphens as flexible separators
    let searchPattern = brandName.trim()
      .replace(/[-\s]+/g, "[\\s&\\-\\.]+")
      .replace(/arp?els/gi, "ar(p)?(e)?ls");

    const filterQuery = {
      published: true,
      category: { $regex: /Watch/i },
      brand: { $regex: new RegExp(`${searchPattern}`, "i") }
    };

    const totalProducts = await Product.countDocuments(filterQuery);

    // Sort configuration similar to getProducts
    const sortOptions = {
      newest: { inStock: -1, createdAt: -1 },
      oldest: { inStock: -1, createdAt: 1 },
      price_low_high: { inStock: -1, salePrice: 1 },
      price_high_low: { inStock: -1, salePrice: -1 },
      name_asc: { inStock: -1, name: 1 },
      name_desc: { inStock: -1, name: -1 },
      featured: { inStock: -1, featured: -1, createdAt: -1 },
    };

    const sortObj = sortOptions[sortBy] || { inStock: -1, createdAt: -1 };

    const products = await Product.find(filterQuery)
      .select(
        "brand model name sku referenceNumber serialNumber watchType watchStyle scopeOfDelivery scopeOfDeliveryWatch " +
        "productionYear gender movement dialColor caseMaterial strapMaterial strapColor dialNumerals " +
        "salePrice regularPrice stockQuantity taxStatus strapSize caseSize includedAccessories " +
        "condition itemCondition category description visibility published featured inStock " +
        "badges images createdAt updatedAt waterResistance complications crystal limitedEdition"
      )
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedProducts = products.map((p) => ({
      ...p,
      brand: p.brand || "",
      category: p.category || "",
      image:
        p.images?.find((img) => img.type === "main")?.url ||
        p.images?.[0]?.url ||
        "",
      available: p.stockQuantity > 0 || p.inStock,
      discount:
        p.regularPrice && p.salePrice && p.regularPrice > p.salePrice
          ? Math.round(((p.regularPrice - p.salePrice) / p.regularPrice) * 100)
          : 0,
      isOnSale: p.regularPrice && p.salePrice && p.regularPrice > p.salePrice,
    }));

    res.json({
      success: true,
      totalProducts,
      count: totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products: formattedProducts,
    });
  } catch (error) {
    console.error("❌ Error fetching brand watches:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


const getBrandBags = async (req, res) => {
  try {
    const brandName = decodeURIComponent(req.params.brand);
    const { page = 1, limit = 16, sortBy = "featured" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    // Flexible brand matching for bags
    let searchPattern = brandName.trim()
      .replace(/[-\s]+/g, "[\\s&\\-\\.]+")
      .replace(/arp?els/gi, "ar(p)?(e)?ls");

    const filterQuery = {
      published: true,
      brand: { $regex: new RegExp(`${searchPattern}`, "i") },
      $or: [
        { category: /Leather Bag/i },
        { category: /Leather Good/i, leatherMainCategory: "Bag" }
      ]
    };

    const totalProducts = await Product.countDocuments(filterQuery);

    const sortOptions = {
      newest: { inStock: -1, createdAt: -1 },
      oldest: { inStock: -1, createdAt: 1 },
      price_low_high: { inStock: -1, salePrice: 1 },
      price_high_low: { inStock: -1, salePrice: -1 },
      name_asc: { inStock: -1, name: 1 },
      name_desc: { inStock: -1, name: -1 },
      featured: { inStock: -1, featured: -1, createdAt: -1 },
    };

    const sortObj = sortOptions[sortBy] || { inStock: -1, createdAt: -1 };

    const products = await Product.find(filterQuery)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedProducts = products.map((p) => ({
      ...p,
      brand: p.brand || "",
      category: p.category || "",
      image:
        p.images?.find((img) => img.type === "main")?.url ||
        p.images?.[0]?.url ||
        "",
      available: p.stockQuantity > 0 || p.inStock,
    }));

    res.json({
      success: true,
      totalProducts,
      count: totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products: formattedProducts,
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
    const brandName = decodeURIComponent(req.params.brand);
    const { page = 1, limit = 16, sortBy = "featured" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    // Flexible brand matching for accessories
    let searchPattern = brandName.trim()
      .replace(/[-\s]+/g, "[\\s&\\-\\.]+")
      .replace(/arp?els/gi, "ar(p)?(e)?ls");

    const filterQuery = {
      published: true,
      category: /Accessor/i,
      brand: { $regex: new RegExp(`${searchPattern}`, "i") }
    };

    const totalProducts = await Product.countDocuments(filterQuery);

    const sortOptions = {
      newest: { inStock: -1, createdAt: -1 },
      oldest: { inStock: -1, createdAt: 1 },
      price_low_high: { inStock: -1, salePrice: 1 },
      price_high_low: { inStock: -1, salePrice: -1 },
      name_asc: { inStock: -1, name: 1 },
      name_desc: { inStock: -1, name: -1 },
      featured: { inStock: -1, featured: -1, createdAt: -1 },
    };

    const sortObj = sortOptions[sortBy] || { inStock: -1, createdAt: -1 };

    const products = await Product.find(filterQuery)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedProducts = products.map((p) => ({
      ...p,
      brand: p.brand || "",
      category: p.category || "",
      image:
        p.images?.find((img) => img.type === "main")?.url ||
        p.images?.[0]?.url ||
        "",
      available: p.stockQuantity > 0 || p.inStock,
    }));

    res.json({
      success: true,
      totalProducts,
      count: totalProducts,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      products: formattedProducts,
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
    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID",
      });
    }

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

    // 📩 Send Email Notification to Admin & Sales
    const adminEmails = ["admin@montres.ae", "sales@montres.ae"];
    const emailSubject = `Restock Request: ${product.name}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #000; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Montres Trading L.L.C – The Art Of Time</h2>
        <p><strong>New Restock Request from Website</strong></p>

        <p><strong>Product Details:</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <tr><td style="padding: 5px; font-weight: bold; width: 120px;">Product:</td><td style="padding: 5px;">${product.name}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">SKU:</td><td style="padding: 5px;">${product.sku || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Category:</td><td style="padding: 5px;">${product.category || "N/A"}</td></tr>
        </table>

        <p><strong>Customer Details:</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <tr><td style="padding: 5px; font-weight: bold; width: 120px;">Name:</td><td style="padding: 5px;">${customerName || "—"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Email:</td><td style="padding: 5px;">${email}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Phone:</td><td style="padding: 5px;">${phone || "—"}</td></tr>
        </table>

        <p style="margin-top: 20px;"><a href="https://www.montres.ae/ProductDetailPage/${product._id}" style="display: inline-block; padding: 10px 15px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px;">View Product</a></p>

        <footer style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
          <p>Sent from Montres Store (www.montres.ae)</p>
        </footer>
      </div>
    `;
    const textContent = `New Restock Request from: ${customerName || "—"}\nEmail: ${email}\nPhone: ${phone || "—"}\nProduct: ${product.name}\nSKU: ${product.sku || "N/A"}\nCategory: ${product.category || "N/A"}`;

    // Send to both emails (parallel)
    await Promise.all(
      adminEmails.map((toEmail) => sendEmail(toEmail, emailSubject, htmlContent, textContent))
    );

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
    // ✅ Validate ID before query
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID",
      });
    }

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
const { SEARCH_SELECT, FUSE_OPTIONS } = require("../utils/searchConstants");

const SEARCH_STOCK_FILTER = {
  published: true,
  $or: [{ stockQuantity: { $gt: 0 } }, { inStock: true }],
};

const getAllProductwithSearch = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const trimmed = search.trim();

    if (trimmed) {
      // Primary: $text search — indexed, ranked by relevance score
      const query = { ...SEARCH_STOCK_FILTER, $text: { $search: trimmed } };
      const textResults = await Product.find(query, { score: { $meta: "textScore" } })
        .select(SEARCH_SELECT)
        .sort({ score: { $meta: "textScore" } })
        .limit(20)
        .lean();

      if (textResults.length > 0) {
        return res.json({ success: true, totalProducts: textResults.length, products: textResults });
      }

      // Fallback: Fuse.js fuzzy search — handles typos like "rolexx" → "Rolex"
      const catalog = await Product.find(SEARCH_STOCK_FILTER)
        .select(SEARCH_SELECT)
        .lean();
      const fuse = new Fuse(catalog, FUSE_OPTIONS);
      const fuzzyResults = fuse.search(trimmed).slice(0, 20).map((r) => r.item);

      return res.json({ success: true, totalProducts: fuzzyResults.length, products: fuzzyResults });
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

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID",
      });
    }

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

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid product ID",
      });
    }

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

const getLimitedEditionProducts = async (req, res) => {
  try {
    const raw = await Product.find({
      limitedEdition: true,
      published: true,
    })
      .select("brand name regularPrice salePrice images category leatherMainCategory subCategory")
      .lean();

    const products = raw.map((p) => ({
      _id: p._id,
      brand: p.brand ?? null,
      name: p.name,
      regularPrice: p.regularPrice ?? 0,
      salePrice: p.salePrice ?? 0,
      image: p.images?.[0]?.url ?? null,
      category: p.category ?? null,
      leatherMainCategory: p.leatherMainCategory ?? null,
      subCategory: p.subCategory ?? null,
    }));

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
  getAllBrands,
  getLimitedEditionProducts
};
