const Product = require("../models/product");

const filerDatareferenceNumber = async (req, res) => {
  try {
    const data = await Product.aggregate([
      {
        $match: {
          referenceNumber: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$referenceNumber",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          value: "$_id",
          count: 1,
        },
      },
      {
        $sort: { value: 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getWatchFilters = async (req, res) => {
  try {
    const { search, gender } = req.query;

    let query = {
      category: "Watch",
      published: true,
      $or: [{ stockQuantity: { $gt: 0 } }, { inStock: true }]
    };

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$and = [
        {
          $or: [
            { name: searchRegex },
            { brand: searchRegex },
            { model: searchRegex },
            { description: searchRegex },
            { referenceNumber: searchRegex },
          ]
        }
      ];
    }

    if (gender) {
      query.gender = { $regex: new RegExp(gender, "i") };
    }

    const [watchTypes, watchStyles, brands, models, movements, caseMaterials, caseColors, dialColors, referenceNumbers] = await Promise.all([
      Product.distinct("watchType", query),
      Product.distinct("watchStyle", query),
      Product.distinct("brand", query),
      Product.distinct("model", query),
      Product.distinct("movement", query),
      Product.distinct("caseMaterial", query),
      Product.distinct("caseColor", query),
      Product.distinct("dialColor", query),
      Product.distinct("referenceNumber", query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        watchTypes: watchTypes.filter(Boolean).sort(),
        watchStyles: watchStyles.filter(Boolean).sort(),
        brands: brands.filter(Boolean).sort(),
        models: models.filter(Boolean).sort(),
        movements: movements.filter(Boolean).sort(),
        caseMaterials: caseMaterials.filter(Boolean).sort(),
        caseColors: caseColors.filter(Boolean).sort(),
        dialColors: dialColors.filter(Boolean).sort(),
        referenceNumbers: referenceNumbers.filter(Boolean).sort()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getBrandFilters = async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};
    if (category) query.category = category;

    const brands = await Product.distinct("brand", query);

    res.status(200).json({
      success: true,
      data: brands.filter(Boolean)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { filerDatareferenceNumber, getWatchFilters, getBrandFilters };
