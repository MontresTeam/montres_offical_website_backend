const HomeProductsGrid = require("../models/homeProuctsGrid");
const Product = require("../models/product");
const BrandNew = require("../models/brnadNewModel");
const TrustedProducts = require("../models/trustedModel");
// Add new homeProducts
const addHomeProductsGrid = async (req, res) => {
  try {
    const { category, products } = req.body;

    // Check max 3 products
    if (products && products.length > 3) {
      return res
        .status(400)
        .json({ message: "You can add up to 3 products only" });
    }

    // Check max 6 documents in the collection
    const count = await HomeProductsGrid.countDocuments();
    if (count >= 6) {
      return res
        .status(400)
        .json({ message: "You can only have up to 6 homeProductsGrid items" });
    }

    // Optional: Validate product IDs
    const validProducts = await Product.find({ _id: { $in: products } });
    if (validProducts.length !== (products ? products.length : 0)) {
      return res
        .status(400)
        .json({ message: "One or more products are invalid" });
    }

    const newHomeProducts = new HomeProductsGrid({ category, products });
    await newHomeProducts.save();

    res
      .status(201)
      .json({
        message: "HomeProductsGrid added successfully",
        homeProducts: newHomeProducts,
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
// Update existing homeProducts
const updateHomeProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, products } = req.body;

    if (products && products.length > 3) {
      return res
        .status(400)
        .json({ message: "You can add up to 3 products only" });
    }

    if (products) {
      const validProducts = await Product.find({ _id: { $in: products } });
      if (validProducts.length !== products.length) {
        return res
          .status(400)
          .json({ message: "One or more products are invalid" });
      }
    }

    const updatedHomeProducts = await HomeProductsGrid.findByIdAndUpdate(
      id,
      { category, products },
      { new: true }
    );
    if (!updatedHomeProducts) {
      return res.status(404).json({ message: "HomeProducts not found" });
    }
    res
      .status(200)
      .json({
        message: "HomeProducts updated successfully",
        homeProducts: updatedHomeProducts,
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};




const getHomeProductsGrid = async (req, res) => {
  try {
    const BASE_MATCH = { inStock: true, stockQuantity: { $gt: 0 } };

    // ── Watches & Accessories: aggregation pipeline grouped by style
    const GROUPED_CATEGORIES = [
      { title: "Watch", styleField: "watchStyle", limit: 1 },
      { title: "Accessories", styleField: "accessoryCategory", limit: 3 },
    ];

    const buildPipeline = (styleField, styleMatch, limit) => [
      { $match: { ...BASE_MATCH, [styleField]: styleMatch } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          name: 1, brand: 1, regularPrice: 1, salePrice: 1,
          seoTitle: 1, seoDescription: 1, slug: 1,
          category: 1, leatherMainCategory: 1, subCategory: 1,
          _styleValue: `$${styleField}`,
          image: {
            $let: {
              vars: {
                mainImg: {
                  $arrayElemAt: [
                    { $filter: { input: { $ifNull: ["$images", []] }, as: "i", cond: { $eq: ["$$i.type", "main"] } } },
                    0,
                  ],
                },
                firstImg: { $arrayElemAt: [{ $ifNull: ["$images", []] }, 0] },
              },
              in: { $ifNull: ["$$mainImg.url", "$$firstImg.url"] },
            },
          },
        },
      },
      {
        $addFields: {
          _styleValues: {
            $cond: { if: { $isArray: "$_styleValue" }, then: "$_styleValue", else: ["$_styleValue"] },
          },
        },
      },
      { $unwind: "$_styleValues" },
      { $match: { _styleValues: { $nin: [null, ""] } } },
      {
        $group: {
          _id: "$_styleValues",
          products: {
            $push: {
              _id: "$_id", name: "$name", brand: "$brand",
              regularPrice: "$regularPrice", salePrice: "$salePrice",
              image: "$image", seoTitle: "$seoTitle", seoDescription: "$seoDescription",
              slug: "$slug", category: "$category",
              leatherMainCategory: "$leatherMainCategory", subCategory: "$subCategory",
            },
          },
        },
      },
      { $project: { _id: 0, subCategory: "$_id", products: { $slice: ["$products", limit] } } },
      { $sort: { subCategory: 1 } },
    ];

    const flatLeatherPipeline = (categoryValue) => [
      { $match: { ...BASE_MATCH, category: categoryValue } },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      {
        $project: {
          name: 1, brand: 1, regularPrice: 1, salePrice: 1,
          seoTitle: 1, seoDescription: 1, slug: 1,
          category: 1, leatherMainCategory: 1, subCategory: 1,
          image: {
            $let: {
              vars: {
                mainImg: {
                  $arrayElemAt: [
                    { $filter: { input: { $ifNull: ["$images", []] }, as: "i", cond: { $eq: ["$$i.type", "main"] } } },
                    0,
                  ],
                },
                firstImg: { $arrayElemAt: [{ $ifNull: ["$images", []] }, 0] },
              },
              in: { $ifNull: ["$$mainImg.url", "$$firstImg.url"] },
            },
          },
        },
      },
    ];

    const mapProduct = (p) => ({
      _id: p._id,
      name: p.name,
      brand: p.brand ?? null,
      regularPrice: p.regularPrice ?? 0,
      salePrice: p.salePrice ?? 0,
      image: p.image ?? null,
      seoTitle: p.seoTitle ?? null,
      seoDescription: p.seoDescription ?? null,
      slug: p.slug ?? null,
      category: p.category ?? null,
      leatherMainCategory: p.leatherMainCategory ?? null,
      subCategory: p.subCategory ?? null,
      inStock: p.inStock ?? true,
      stockQuantity: p.stockQuantity ?? 1,
    });

    const [leatherGoodsProducts, leatherBagsProducts, ...groupedResults] = await Promise.all([
      Product.aggregate(flatLeatherPipeline("Leather Goods")),
      Product.aggregate(flatLeatherPipeline("Leather Bags")),
      ...GROUPED_CATEGORIES.map(({ styleField, limit }) =>
        Product.aggregate(buildPipeline(styleField, { $exists: true, $ne: null }, limit))
      ),
    ]);

    const homeProducts = [
      {
        category: "Leather Goods",
        products: leatherGoodsProducts.map(mapProduct),
      },
      {
        category: "Leather Bags",
        products: leatherBagsProducts.map(mapProduct),
      },
      ...groupedResults.map((grouped, index) => ({
        category: GROUPED_CATEGORIES[index].title,
        groupedProducts: grouped.map(({ subCategory, products }) => ({
          subCategory,
          products: products.map(mapProduct),
        })),
      })),
    ];

    res.status(200).json({
      success: true,
      totalCategories: homeProducts.length,
      homeProducts,
    });

  } catch (error) {
    console.error("Home Grid Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const getBrandNewProducts = async (req, res) => {
  try {
    const brandNew = await BrandNew.findOne().populate("products"); // remove populate() if you only need IDs

    if (!brandNew) {
      return res.status(404).json({ message: "No BrandNew products found" });
    }

    res.status(200).json({ message: "Fetched successfully", data: brandNew });
  } catch (error) {
    console.error("Error fetching BrandNew products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Update BrandNew products (replace all)
const updateBrandNewProducts = async (req, res) => {
  try {
    const { products } = req.body;

    // Validation
    if (!products || !Array.isArray(products)) {
      return res
        .status(400)
        .json({ message: "Products must be an array of IDs" });
    }

    if (products.length > 6) {
      return res
        .status(400)
        .json({ message: "You can add up to 6 products only" });
    }

    let brandNew = await BrandNew.findOne();

    // If no record exists, just create a new one
    if (!brandNew) {
      brandNew = new BrandNew({ products });
      await brandNew.save();
      return res.status(200).json({
        message: "BrandNew list created successfully",
        data: brandNew,
      });
    }

    // Convert all IDs to strings for easier comparison
    const existing = brandNew.products.map((id) => id.toString());

    // --- Handle different update cases ---
    // 1️⃣ Replace all → if incoming array has the same size or new order
    if (products.length && !products.some((id) => !existing.includes(id))) {
      brandNew.products = products; // reorder or replace all
    }
    // 2️⃣ Add new unique items
    else if (products.length > existing.length) {
      const newUnique = products.filter((id) => !existing.includes(id));
      brandNew.products = [...existing, ...newUnique].slice(0, 6);
    }
    // 3️⃣ Remove or partially update
    else {
      // Keep only what exists in the new array (handles removals)
      brandNew.products = existing.filter((id) => products.includes(id));

      // Add any new unique IDs from incoming array
      const newOnes = products.filter((id) => !existing.includes(id));
      brandNew.products.push(...newOnes);
    }

    // Ensure unique and max 6
    brandNew.products = [...new Set(brandNew.products)].slice(0, 6);

    await brandNew.save();

    res.status(200).json({
      message: "BrandNew products updated successfully",
      data: brandNew,
    });
  } catch (error) {
    console.error("Error updating BrandNew products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateTrustedProducts = async (req, res) => {
  try {
    const { newArrivals, montresTrusted, replace = false } = req.body;

    // Validate at least one field provided
    if (!newArrivals && !montresTrusted) {
      return res.status(400).json({ message: "Please provide data to update" });
    }

    // Find the single homeProducts document
    let homeProducts = await TrustedProducts.findOne();
    if (!homeProducts) {
      return res.status(404).json({ message: "Home products not found" });
    }

    // 🧠 REPLACE MODE: overwrite existing arrays directly
    if (replace) {
      if (newArrivals) {
        if (newArrivals.length > 6)
          return res
            .status(400)
            .json({ message: "Maximum 6 products allowed in New Arrivals" });
        homeProducts.newArrivals = newArrivals;
      }

      if (montresTrusted) {
        if (montresTrusted.length > 6)
          return res
            .status(400)
            .json({ message: "Maximum 6 products allowed in Montres Trusted" });
        homeProducts.montresTrusted = montresTrusted;
      }
    }
    // 🧩 MERGE MODE: add or reorder existing ones
    else {
      if (newArrivals) {
        const merged = [
          ...new Set([...homeProducts.newArrivals.map(String), ...newArrivals]),
        ];
        if (merged.length > 6)
          return res
            .status(400)
            .json({ message: "Maximum 6 products allowed in New Arrivals" });
        homeProducts.newArrivals = merged;
      }

      if (montresTrusted) {
        const merged = [
          ...new Set([
            ...homeProducts.montresTrusted.map(String),
            ...montresTrusted,
          ]),
        ];
        if (merged.length > 6)
          return res
            .status(400)
            .json({ message: "Maximum 6 products allowed in Montres Trusted" });
        homeProducts.montresTrusted = merged;
      }
    }

    await homeProducts.save();

    res.status(200).json({
      message: "Home products updated successfully",
      data: homeProducts,
    });
  } catch (error) {
    console.error("Error updating home products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const PRODUCT_FIELDS = "brand name regularPrice salePrice images category leatherMainCategory subCategory inStock stockQuantity";

const toCardShape = (p) => ({
  _id: p._id,
  brand: p.brand ?? null,
  name: p.name,
  regularPrice: p.regularPrice ?? 0,
  salePrice: p.salePrice ?? 0,
  image: p.images?.[0]?.url ?? null,
  category: p.category ?? null,
  leatherMainCategory: p.leatherMainCategory ?? null,
  subCategory: p.subCategory ?? null,
  inStock: p.inStock ?? true,
  stockQuantity: p.stockQuantity ?? 1,
});

const getTrustedProduct = async (req, res) => {
  try {
    const homeProducts = await TrustedProducts.findOne()
      .populate("newArrivals", PRODUCT_FIELDS)
      .populate("montresTrusted", PRODUCT_FIELDS)
      .lean();

    if (!homeProducts) {
      return res.status(404).json({ message: "No home products found" });
    }

    const rawData = {
      newArrivals: (homeProducts.newArrivals ?? []).filter(
        (p) => p.inStock && p.stockQuantity > 0
      ),
      montresTrusted: (homeProducts.montresTrusted ?? []).filter(
        (p) => p.inStock && p.stockQuantity > 0
      ),
    };

    res.status(200).json({
      message: "Home products fetched successfully",
      data: {
        newArrivals: rawData.newArrivals.map(toCardShape),
        montresTrusted: rawData.montresTrusted.map(toCardShape),
      },
    });
  } catch (error) {
    console.error("Error fetching home products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


module.exports = {
  addHomeProductsGrid,
  updateHomeProducts,
  getHomeProductsGrid,
  getBrandNewProducts,
  updateBrandNewProducts,
  updateTrustedProducts,
  getTrustedProduct,
};
