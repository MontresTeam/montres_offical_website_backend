// Shipping rules configuration
const SHIPPING_RULES = {
  local: {
    threshold: 500,
    fee: 30,
  },
  gcc: {
    threshold: 1000,
    fee: 100,
  },
  worldwide: {
    threshold: 1500,
    fee: 150,
  },
};

/**
 * Get region from country name
 * @param {string} country
 * @returns {'local' | 'gcc' | 'worldwide'}
 */
const getRegionFromCountry = (country = "") => {
  const lower = country.trim().toLowerCase();

  const UAE_ALIASES = ["united arab emirates", "uae", "dubai", "abu dhabi", "abudhabi", "ae"];
  const GCC = ["saudi arabia", "bahrain", "kuwait", "qatar", "oman", "ksa", "sa", "bh", "kw", "qa", "om"];

  if (UAE_ALIASES.some(u => lower === u || lower.includes(u))) return "local";
  if (GCC.some(g => lower === g || lower.includes(g))) return "gcc";
  return "worldwide";
};

/**
 * Calculate shipping fee based on subtotal and destination region.
 * @param {Object} params
 * @param {string} params.country
 * @param {string} [params.region]
 * @param {number} params.subtotal
 * @returns {{shippingFee: number, region: string, threshold: number}}
 */
const calculateShippingFee = ({ country, region, subtotal = 0 }) => {
  const resolvedRegion = region ? region.toLowerCase() : getRegionFromCountry(country);
  const rule = SHIPPING_RULES[resolvedRegion] || SHIPPING_RULES.worldwide;

  // ✅ Free shipping if subtotal ≥ threshold, else fee applies
  const fee = subtotal >= rule.threshold ? 0 : rule.fee;

  return {
    shippingFee: fee,
    region: resolvedRegion,
    threshold: rule.threshold,
  };
};

module.exports = { calculateShippingFee, getRegionFromCountry };
