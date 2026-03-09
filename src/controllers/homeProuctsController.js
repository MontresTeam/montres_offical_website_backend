const HomeProductsGrid = require("../models/homeProuctsGrid");
const Product = require("../models/product");
const BrandNew = require("../models/brnadNewModel");
const TrustedProducts = require("../models/trustedModel");
// Add new homeProducts
const addHomeProductsGrid = async (req, res) => {
  try {
    const { title, products } = req.body;

    // Check max 3 products
    if (products && products.length > 3) {
      return res
        .status(400)
        .json({ message: "You can add up to 3 products only" });
    }

    // Check max 6 documents in the collection
    const count = await HomeProducts.countDocuments();
    if (count >= 6) {
      return res
        .status(400)
        .json({ message: "You can only have up to 6 homeProductsGrid items" });
    }

    // Optional: Validate product IDs
    const validProducts = await Product.find({ _id: { $in: products } });
    if (validProducts.length !== products.length) {
      return res
        .status(400)
        .json({ message: "One or more products are invalid" });
    }

    const newHomeProducts = new HomeProducts({ title, products });
    await newHomeProducts.save();

    res
      .status(201)
      .json({
        message: "HomeProductsGrid added successfully",
        HomeProducts: HomeProducts,
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
    const { title, products } = req.body;
    console.log(req.body);

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

    const updatedHomeProducts = await HomeProducts.findByIdAndUpdate(
      id,
      { title, products },
      { new: true }
    );
    console.log(updatedHomeProducts, "if");
    if (!updatedHomeProducts) {
      return res.status(404).json({ message: "HomeProducts not found" });
    }
    console.log(updatedHomeProducts, "updatedHomeProducts success");
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
    // ── Watches & Accessories: grouped by style (1 watch / 3 accessories per style)
    const groupedCategories = [
      { title: "Watch", styleField: "watchStyle" },
      { title: "Accessories", styleField: "accessoryCategory" },
    ];

    // ── Leather: flat list using the `category` field (indexed, most reliable)
    const leatherFilter = {
      category: "Leather Goods",
      inStock: true,
      stockQuantity: { $gt: 0 },
    };
    const leatherBagsFilter = {
      category: "Leather Bags",
      inStock: true,
      stockQuantity: { $gt: 0 },
    };

    const [leatherGoods, leatherBags, ...groupedResults] = await Promise.all([
      Product.find(leatherFilter).sort({ createdAt: -1 }).limit(10),
      Product.find(leatherBagsFilter).sort({ createdAt: -1 }).limit(10),
      ...groupedCategories.map(async (cat) => {
        const filter = {
          [cat.styleField]: { $exists: true, $ne: null },
          inStock: true,
          stockQuantity: { $gt: 0 },
        };

        const productsInCategory = await Product.find(filter).sort({ createdAt: -1 });

        const styles = [
          ...new Set(productsInCategory.flatMap(p => p[cat.styleField]).filter(Boolean))
        ];

        const groupedProducts = styles.map(style => {
          const matched = productsInCategory.filter(p => {
            const val = p[cat.styleField];
            return Array.isArray(val) ? val.includes(style) : val === style;
          });
          return {
            subCategory: style,
            products: cat.title === "Watch" ? matched.slice(0, 1) : matched.slice(0, 3),
          };
        });

        return { category: cat.title, groupedProducts };
      }),
    ]);

    // Wrap leather flat lists into the same grouped shape the frontend expects
    const leatherGoodsEntry = {
      category: "Leather Goods",
      groupedProducts: [{ subCategory: "All", products: leatherGoods }],
    };
    const leatherBagsEntry = {
      category: "Leather Bags",
      groupedProducts: [{ subCategory: "All", products: leatherBags }],
    };

    const homeProducts = [
      ...groupedResults,
      ...(leatherGoods.length ? [leatherGoodsEntry] : []),
      ...(leatherBags.length ? [leatherBagsEntry] : []),
    ];

    res.status(200).json({
      success: true,
      category: homeProducts.length,
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

const getTrustedProduct = async (req, res) => {
  try {
    const homeProducts = await TrustedProducts.findOne()
      .populate({
        path: "newArrivals",
        match: { inStock: true, stockQuantity: { $gt: 0 } }
      })
      .populate({
        path: "montresTrusted",
        match: { inStock: true, stockQuantity: { $gt: 0 } }
      });

    if (homeProducts) {
      // Filter out null items (where product mismatch occurred due to stock match)
      homeProducts.newArrivals = homeProducts.newArrivals.filter(p => p !== null);
      homeProducts.montresTrusted = homeProducts.montresTrusted.filter(p => p !== null);
    }

    if (!homeProducts) {
      return res.status(404).json({ message: "No home products found" }); //
    }

    res.status(200).json({
      message: "Home products fetched successfully",
      data: homeProducts,
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
