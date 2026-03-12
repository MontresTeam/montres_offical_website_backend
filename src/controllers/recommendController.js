// controllers/recommendController.js
const Product = require('../models/product');
const UserActivity = require('../models/UserActivity');

const CARD_SELECT = "brand name regularPrice salePrice images category leatherMainCategory subcategory";
const STOCK_FILTER = { published: true, $or: [{ stockQuantity: { $gt: 0 } }, { inStock: true }] };

const toCard = (p) => ({
  _id: p._id,
  brand: p.brand ?? null,
  name: p.name,
  regularPrice: p.regularPrice ?? 0,
  salePrice: p.salePrice ?? 0,
  image: p.images?.find((i) => i.type === "main")?.url ?? p.images?.[0]?.url ?? null,
  category: p.category ?? null,
  leatherMainCategory: p.leatherMainCategory ?? null,
  subCategory: p.subcategory ?? null,
  inStock: true,
  stockQuantity: 1,
});

function mergeUnique(arrays, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const p of arr) {
      const id = p._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        out.push(p);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

const getTrending = () =>
  Product.find(STOCK_FILTER)
    .select(CARD_SELECT)
    .sort({ sold: -1, rating: -1 })
    .limit(12)
    .lean();

exports.getJustForYou = async (req, res) => {
  try {
    const userId = req.params.userId || null;

    if (!userId) {
      return res.json((await getTrending()).map(toCard));
    }

    const activity = await UserActivity.findOne({ userId }).lean();

    if (!activity) {
      return res.json((await getTrending()).map(toCard));
    }

    const results = [];

    // 1) Last viewed category
    if (activity.lastViewedCategory) {
      const catProducts = await Product.find({
        category: activity.lastViewedCategory,
        ...STOCK_FILTER,
      })
        .select(CARD_SELECT)
        .sort({ sold: -1, rating: -1 })
        .limit(12)
        .lean();
      results.push(catProducts);
    }

    // 2) Wishlist-based — fetch only brand/category to derive query params
    if (activity.wishlist?.length) {
      const wishlistProducts = await Product.find({ _id: { $in: activity.wishlist } })
        .select("brand category")
        .lean();

      const wishlistBrands = [...new Set(wishlistProducts.map((p) => p.brand).filter(Boolean))];
      const wishlistCats = [...new Set(wishlistProducts.map((p) => p.category).filter(Boolean))];

      if (wishlistBrands.length) {
        results.push(
          await Product.find({ brand: { $in: wishlistBrands }, ...STOCK_FILTER })
            .select(CARD_SELECT)
            .sort({ sold: -1, rating: -1 })
            .limit(8)
            .lean()
        );
      }

      if (wishlistCats.length) {
        results.push(
          await Product.find({ category: { $in: wishlistCats }, ...STOCK_FILTER })
            .select(CARD_SELECT)
            .sort({ sold: -1, rating: -1 })
            .limit(8)
            .lean()
        );
      }
    }

    // 3) Similar price range
    let avgPrice = activity.averagePriceSeen || 0;

    if (!avgPrice && activity.viewedProducts?.length) {
      const lastViewed = await Product.findById(activity.viewedProducts.slice(-1)[0])
        .select("regularPrice")
        .lean();
      if (lastViewed) avgPrice = lastViewed.regularPrice || 0;
    }

    if (avgPrice > 0) {
      const delta = Math.max(avgPrice * 0.2, 100);
      results.push(
        await Product.find({
          regularPrice: { $gte: avgPrice - delta, $lte: avgPrice + delta },
          ...STOCK_FILTER,
        })
          .select(CARD_SELECT)
          .sort({ sold: -1 })
          .limit(12)
          .lean()
      );
    }

    // 4) Trending fallback
    results.push(await getTrending());

    return res.json(mergeUnique(results, 12).map(toCard));
  } catch (err) {
    console.error("Recommendation Error:", err);
    return res.status(500).json({ message: "Server error generating recommendations" });
  }
};
