const mongoose = require("mongoose");

/**
 * Builds a MongoDB query object from request query parameters.
 * Shared between product listing and faceted search.
 */
const buildProductQuery = (queryParams) => {
    const {
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
        referenceNumber,
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
        leatherSubCategory,
        accessoryCategory,
        accessorySubCategory,
        material,
        color,
        hardware,
        interiorMaterial,
        search
    } = queryParams;

    const filterQuery = { published: true };
    const andConditions = [];

    const normalizeArray = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
    };

    // Search
    if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), "i");
        andConditions.push({
            $or: [
                { name: searchRegex },
                { brand: searchRegex },
                { model: searchRegex },
                { description: searchRegex },
                { referenceNumber: searchRegex },
                { sku: searchRegex }
            ],
        });
    }

    // Category
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

    // Brand
    const selectedBrands = normalizeArray(brand);
    if (selectedBrands.length > 0) {
        andConditions.push({
            brand: { $in: selectedBrands.map((br) => new RegExp(`^${br.trim()}$`, "i")) },
        });
    }

    // Model
    const modelList = normalizeArray(model);
    if (modelList.length > 0) {
        andConditions.push({
            model: { $in: modelList.map((m) => new RegExp(m, "i")) },
        });
    }

    // Reference Number
    const referenceNumberList = normalizeArray(referenceNumber);
    if (referenceNumberList.length > 0) {
        andConditions.push({
            referenceNumber: {
                $in: referenceNumberList.map((ref) => new RegExp(ref, "i")),
            },
        });
    }

    // Type (Watch Type)
    const typeList = normalizeArray(type);
    if (typeList.length > 0) {
        andConditions.push({
            watchType: { $in: typeList.map((t) => new RegExp(t, "i")) },
        });
    }

    // Price
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

    // Availability
    const availList = normalizeArray(availability);
    if (availList.length > 0) {
        const hasInStock = availList.some(v => v.toLowerCase() === "in_stock" || v.toLowerCase() === "in stock");
        const hasOutOfStock = availList.some(v => v.toLowerCase() === "out_of_stock" || v.toLowerCase() === "sold out");

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

    // Gender
    const genderList = normalizeArray(gender);
    if (genderList.length > 0) {
        andConditions.push({
            gender: { $in: genderList.map((g) => new RegExp(g, "i")) },
        });
    }

    // Condition
    const conditionList = normalizeArray(condition);
    if (conditionList.length > 0) {
        andConditions.push({
            condition: { $in: conditionList.map((c) => new RegExp(c, "i")) },
        });
    }

    // Item Condition
    const itemConditionList = normalizeArray(itemCondition);
    if (itemConditionList.length > 0) {
        andConditions.push({
            itemCondition: {
                $in: itemConditionList.map((ic) => new RegExp(ic, "i")),
            },
        });
    }

    // Watch Specific
    const dialColorList = normalizeArray(dialColor);
    if (dialColorList.length > 0) {
        andConditions.push({ dialColor: { $in: dialColorList.map(c => new RegExp(c, "i")) } });
    }

    const caseMaterialList = normalizeArray(caseMaterial);
    if (caseMaterialList.length > 0) {
        andConditions.push({ caseMaterial: { $in: caseMaterialList.map(m => new RegExp(m, "i")) } });
    }

    const movementList = normalizeArray(movement);
    if (movementList.length > 0) {
        andConditions.push({ movement: { $in: movementList.map(m => new RegExp(m, "i")) } });
    }

    // Leather Goods
    const leatherMainList = normalizeArray(leatherMainCategory);
    if (leatherMainList.length > 0) {
        andConditions.push({ leatherMainCategory: { $in: leatherMainList.map(c => new RegExp(`^${c}$`, "i")) } });
    }

    const leatherSubList = normalizeArray(leatherSubCategory);
    if (leatherSubList.length > 0) {
        andConditions.push({ leatherSubCategory: { $in: leatherSubList.map(c => new RegExp(`^${c}$`, "i")) } });
    }

    // Merge
    if (andConditions.length > 0) {
        filterQuery.$and = andConditions;
    }

    return filterQuery;
};

module.exports = { buildProductQuery };
