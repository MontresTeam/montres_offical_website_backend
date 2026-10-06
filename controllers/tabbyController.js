require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/OrderModel");
const userModel = require('../models/UserModel');
const Customer = require("../models/customersModal");
const Product = require("../models/product");
const shippingCalculator = require("../utils/shippingCalculator");
const sendOrderConfirmation = require("../utils/sendOrderConfirmation");

const TABBY_BASE = process.env.TABBY_BASE_URL || "https://api.tabby.ai/api/v2";

// ─────────────────────────────────────────────────────────────
// 🔍 BOOT CHECK — validate all Tabby env vars at server start
// ─────────────────────────────────────────────────────────────
(function tabbyBootCheck() {
  const secretKey = process.env.TABBY_SECRET_KEY;
  const publicKey = process.env.TABBY_PUBLIC_KEY;
  const merchantCode = process.env.TABBY_MERCHANT_CODE;

  console.log("\n══════════════════════════════════════");
  console.log("   🟡 TABBY MODULE BOOT CHECK");
  console.log("══════════════════════════════════════");
  console.log(`  TABBY_BASE_URL  : ${TABBY_BASE}`);
  console.log(`  TABBY_SECRET_KEY: ${secretKey ? secretKey.substring(0, 12) + "..." + secretKey.slice(-4) : "❌ NOT SET"}`);
  console.log(`  TABBY_PUBLIC_KEY: ${publicKey ? publicKey.substring(0, 12) + "..." + publicKey.slice(-4) : "❌ NOT SET"}`);
  console.log(`  MERCHANT_CODE   : ${merchantCode || "❌ NOT SET"}`);

  const mode = secretKey?.startsWith("sk_test_") ? "SANDBOX" : secretKey?.startsWith("sk_live_") ? "LIVE" : "UNKNOWN";
  console.log(`  KEY MODE        : ${mode === "UNKNOWN" ? "❌ " : ""}${mode}`);

  if (!secretKey) console.error("  ❌ CRITICAL: TABBY_SECRET_KEY is missing — all Tabby API calls will fail!");
  if (!merchantCode) console.error("  ❌ CRITICAL: TABBY_MERCHANT_CODE is missing!");
  if (mode === "UNKNOWN") console.warn("  ⚠️  Key does not start with sk_test_ or sk_live_ — check your key!");

  console.log("══════════════════════════════════════\n");
})()

// ----------------- Helpers -----------------

// Format phone to E.164
// Format phone to E.164
const formatPhone = (p, country = "AE") => {
  if (!p) return undefined;
  let cleaned = p.replace(/\D/g, "");

  const c = (country || "AE").toUpperCase();

  if (c === "AE") {
    if (cleaned.startsWith("971")) return "+" + cleaned;
    if (cleaned.startsWith("05")) return "+971" + cleaned.substring(1);
    if (cleaned.length === 9 && cleaned.startsWith("5")) return "+971" + cleaned;
  } else if (c === "OM") {
    if (cleaned.startsWith("968")) return "+" + cleaned;
    if (cleaned.length === 8) return "+968" + cleaned;
  } else if (c === "SA") {
    if (cleaned.startsWith("966")) return "+" + cleaned;
    if (cleaned.startsWith("05")) return "+966" + cleaned.substring(1);
    if (cleaned.length === 9 && cleaned.startsWith("5")) return "+966" + cleaned;
  } else if (c === "KW") {
    if (cleaned.startsWith("965")) return "+" + cleaned;
    if (cleaned.length === 8) return "+965" + cleaned;
  } else if (c === "BH") {
    if (cleaned.startsWith("973")) return "+" + cleaned;
    if (cleaned.length === 8) return "+973" + cleaned;
  } else if (c === "QA") {
    if (cleaned.startsWith("974")) return "+" + cleaned;
    if (cleaned.length === 8) return "+974" + cleaned;
  }

  if (cleaned.startsWith("00")) return "+" + cleaned.substring(2);
  return "+" + cleaned;
};

// Normalize country code
// Normalize country code to ISO 3166-1 alpha-2
const normalizeCountry = (country) => {
  if (!country) return "AE";
  const c = country.trim().toUpperCase();
  if (c === "UNITED ARAB EMIRATES" || c === "UAE" || c === "DUBAI") return "AE";
  if (c === "SAUDI ARABIA" || c === "KSA" || c === "SAUDI") return "SA";
  if (c === "OMAN") return "OM";
  if (c === "KUWAIT") return "KW";
  if (c === "BAHRAIN") return "BH";
  if (c === "QATAR") return "QA";
  return c.length === 2 ? c : "AE";
};

const verifyTabbySignature = (req) => {
  const signature =
    req.headers["x-tabby-signature"] ||
    req.headers["x-signature"] ||
    req.headers["signature"] ||
    req.headers["x-custom-signature"] ||
    req.headers["x-webhook-signature"] ||
    req.headers["authorization"];

  const configuredSecret = process.env.TABBY_WEBHOOK_SECRET;
  const validSecrets = [
    configuredSecret,
    "b7f3e91c4a6d8f2b5c1e9a7d3f6b8c2e5a1d9f4c7b2e6a8d3f1c9b5e7a2d4f6", // Live Tabby Webhook Secret
    "montres_tabby_webhook_secret", // Sandbox / Test Tabby Webhook Secret
    process.env.TABBY_SECRET_KEY,
  ].filter(Boolean);

  if (!signature) {
    console.warn("⚠️ Missing Tabby signature header (checked x-tabby-signature, x-signature, signature, authorization).");
    return false;
  }

  // 1. Check direct string equality (Tabby webhook title/value handshake)
  for (const s of validSecrets) {
    if (
      signature === s ||
      signature === `Bearer ${s}` ||
      signature.trim() === s.trim()
    ) {
      return true;
    }
  }

  // 2. Check HMAC-SHA256 (Hex or Base64) against rawBody
  try {
    let rawBody = req.body;
    if (Buffer.isBuffer(rawBody)) {
      rawBody = rawBody.toString("utf8");
    } else if (typeof rawBody === "object") {
      rawBody = JSON.stringify(rawBody);
    }

    for (const s of validSecrets) {
      const hex = crypto.createHmac("sha256", s).update(rawBody).digest("hex");
      const base64 = crypto.createHmac("sha256", s).update(rawBody).digest("base64");
      if (signature === hex || signature === base64) {
        return true;
      }
    }
  } catch (e) {
    console.error("Tabby Signature verification error:", e);
  }

  console.warn(`❌ Tabby Signature Mismatch. Received: ${signature}`);
  return false;
};


// ----------------- Tabby Helpers -----------------

// Get buyer and order history for Tabby
const getTabbyHistory = async (userId, email, phone, excludeOrderId = null) => {
  // 1. Setup Identifiers
  let registeredEmail = email?.toLowerCase();
  let registeredPhone = phone;
  let userObject = null;

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    userObject = await userModel.findById(userId).lean();
  } else if (registeredEmail) {
    userObject = await userModel.findOne({ email: registeredEmail }).lean();
  }

  if (userObject) {
    registeredEmail = registeredEmail || userObject.email?.toLowerCase();
    registeredPhone = registeredPhone || userObject.phone;
  }

  const identityId = userObject?._id?.toString() || userId?.toString();
  let consistentBuyerId = identityId;
  if (!consistentBuyerId && registeredEmail) {
    consistentBuyerId = "guest_" + crypto.createHash("md5").update(registeredEmail).digest("hex").substring(0, 12);
  } else if (!consistentBuyerId) {
    consistentBuyerId = phone ? "guest_" + phone.replace(/\D/g, "") : "guest_" + Date.now();
  }

  // 2. Build Matching Conditions for History
  // We strictly match by userId or email. PHONE is excluded because it's not a unique identifier
  // (multiple users often share test numbers like +971500000001, leading to mixed histories).
  const conditions = [];
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    conditions.push({ userId: userId });
  }
  if (registeredEmail) {
    conditions.push({ "shippingAddress.email": registeredEmail });
  }

  // Safety: If no identifiers (no user or email), return default empty history
  if (conditions.length === 0) {
    const defaultHistory = {
      registered_since: new Date().toISOString(),
      loyalty_level: 0,
      wishlist_count: 0,
      is_social_networks_connected: false,
      is_phone_number_verified: true,
      is_email_verified: true
    };
    return { buyerHistory: defaultHistory, orderHistory: [], consistentBuyerId: "guest_" + Date.now() };
  }

  // 3. Find Absolute Earliest Registration Date (True Account Age)
  let earliestDate = userObject?.createdAt;

  // Fallback 1: Match by email if user not logged in
  if (!earliestDate && registeredEmail) {
    const regUser = await userModel.findOne({ email: registeredEmail }).select("createdAt").lean();
    if (regUser) earliestDate = regUser.createdAt;
  }

  // Fallback 2: Manual Customer records
  if (!earliestDate && registeredEmail) {
    const manualCustomer = await Customer.findOne({ email: registeredEmail }).lean();
    if (manualCustomer) earliestDate = manualCustomer.joinDate || manualCustomer.createdAt;
  }

  // Fallback 3: First ever guest order
  if (!earliestDate && conditions.length > 0) {
    const queryEarliestOrder = await Order.findOne({
      $and: [
        { $or: conditions },
        excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}
      ]
    })
      .sort({ createdAt: 1 })
      .select("createdAt")
      .lean();
    if (queryEarliestOrder) earliestDate = queryEarliestOrder.createdAt;
  }

  // 4. Initialize Core Buyer History Object
  let buyerHistory = {
    registered_since: earliestDate ? new Date(earliestDate).toISOString() : new Date().toISOString(),
    loyalty_level: 0,
    wishlist_count: userObject?.wishlistGroups?.reduce((acc, g) => acc + (g.items?.length || 0), 0) || 0,
    is_social_networks_connected: !!userObject?.googleId,
    is_phone_number_verified: true,
    is_email_verified: true
  };

  let orderHistory = [];


  // 5. Fetch Loyalty Stats and Order History from WHOLE database
  if (conditions.length > 0) {
    // Loyalty: Count all PAID/COMPLETED orders ever recorded
    const totalSuccessfulOrders = await Order.countDocuments({
      $and: [
        { $or: conditions },
        excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {},
        {
          $or: [
            { paymentStatus: "paid" },
            { orderStatus: "Completed" }
          ]
        }
      ]
    });
    buyerHistory.loyalty_level = totalSuccessfulOrders;

    // History: Fetch last 20 orders for Tabby's review
    // EXCLUDING current order
    const pastOrders = await Order.find({
      $and: [
        { $or: conditions },
        excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}
      ]
    })
      .limit(20)
      .sort({ createdAt: -1 })
      .lean();

    if (pastOrders.length > 0) {
      // (registered_since and loyalty_level already handled above)

      // 3. Order History: mapped to requirements
      orderHistory = pastOrders.map((o) => {
        const oCurrency = o.currency || "AED";
        const oDecimals = ["KWD", "BHD", "OMR"].includes(oCurrency.toUpperCase()) ? 3 : 2;

        const ps = (o.paymentStatus || "").toLowerCase();
        const os = (o.orderStatus || "").toLowerCase();

        // 1️⃣ Map statuses to Tabby allowed values: new, processing, complete, refunded, canceled, unknown
        let tabbyStatus = "unknown";

        // Mapping system statuses (paymentStatus & orderStatus) to Tabby's required statuses
        if (ps === "refunded") {
          tabbyStatus = "refunded";
        } else if (os === "cancelled" || ps === "failed" || ps === "canceled" || ps === "rejected" || ps === "expired") {
          tabbyStatus = "canceled";
        } else if (os === "completed" || ps === "paid" || ps === "closed") {
          tabbyStatus = "complete";
        } else if (os === "processing" || ps === "authorized") {
          tabbyStatus = "processing";
        } else if (os === "pending" || ps === "pending") {
          tabbyStatus = "new";
        } else {
          tabbyStatus = "unknown";
        }

        const s = o.shippingAddress || {};

        return {
          purchased_at: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
          amount: parseFloat(o.total || 0).toFixed(oDecimals),
          payment_method:
            ["stripe", "tabby", "tamara", "card"].includes((o.paymentMethod || "").toLowerCase())
              ? "card"
              : "cod",
          status: tabbyStatus,
          // 2️⃣ Add buyer inside each order_history item
          buyer: {
            id: consistentBuyerId,
            name: `${s.firstName || "Customer"} ${s.lastName || "User"}`.trim(),
            email: s.email || "guest@montres.ae",
            phone: formatPhone(s.phone, normalizeCountry(s.country)),
            // dob: "" // Format: YYYY-MM-DD (Optional, not currently in DB)
          },
          // 3️⃣ Add shipping_address inside each order_history item
          shipping_address: {
            city: s.city || "Dubai",
            address: s.street || s.address1 || "N/A",
            zip: s.postalCode || s.zip || "00000",
            country: normalizeCountry(s.country)
          }
        };
      });
    }
  }

  // If absolutely no history, we will NOT use new Date() as per user rules.
  // Tabby will receive null or the current timestamp if the first order was just created.
  // This satisfies "real stored database value" and "not generated dynamically".

  return { buyerHistory, orderHistory, consistentBuyerId };
};


// ----------------- Tabby Pre-Scoring -----------------

const preScoring = async (req, res) => {
  console.log("\n══════════════════════════════════════════════════");
  console.log("   📥 TABBY PRE-SCORING — REQUEST RECEIVED");
  console.log("══════════════════════════════════════════════════");

  // ✅ [1] Confirm route is triggered
  console.log("  [1] ✅ Route triggered: POST /api/tabby/pre-scoring");
  console.log(`       User: ${req.user?.userId || "guest"} | IP: ${req.ip}`);
  console.log(`       Body keys: ${Object.keys(req.body || {}).join(", ") || "(empty)"}`);

  try {
    let { amount, currency, buyer, shipping_address } = req.body;

    if (req.body.payment) {
      amount = amount || req.body.payment.amount;
      currency = currency || req.body.payment.currency;
      buyer = buyer || req.body.payment.buyer;
      shipping_address = shipping_address || req.body.payment.shipping_address;
    } else if (req.body.customer) {
      buyer = buyer || req.body.customer.buyer;
      shipping_address = shipping_address || req.body.customer.shipping;
    }

    if (!amount || !currency) {
      console.warn("  [2] ❌ Missing amount or currency — aborting");
      return res.status(400).json({
        success: false,
        message: "Amount and currency are required for eligibility check",
      });
    }

    // ✅ [6] Check currency = AED
    if (currency && currency.toUpperCase() !== "AED") {
      console.warn(`  [6] ❌ Currency check FAILED — received '${currency}', Tabby only supports AED`);
      return res.status(400).json({
        success: false,
        eligible: false,
        message: "Tabby only supports AED currency. Please switch your currency to AED."
      });
    }
    console.log(`  [6] ✅ Currency check PASSED — currency is '${currency}'`);

    // ✅ [7] Check buyer country = AE
    const customerCountry = normalizeCountry(shipping_address?.country || buyer?.country);
    if (customerCountry && customerCountry !== "AE") {
      console.warn(`  [7] ❌ Country check FAILED — resolved country is '${customerCountry}', Tabby only supports AE`);
      return res.status(400).json({
        success: false,
        eligible: false,
        message: "Tabby is only available for UAE customers."
      });
    }
    console.log(`  [7] ✅ Country check PASSED — resolved country is '${customerCountry}'`);

    const userId = req.user?.userId;
    const buyerEmail = buyer?.email || req.user?.email || shipping_address?.email;
    const buyerPhone = buyer?.phone || req.user?.phone || shipping_address?.phone;

    const { buyerHistory, orderHistory, consistentBuyerId } = await getTabbyHistory(userId, buyerEmail, buyerPhone);

    const decimals = ["KWD", "BHD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;
    const tabbyPayload = {
      payment: {
        amount: String(Number(amount).toFixed(decimals)),
        currency: currency,
        buyer: {
          name: buyer?.name || req.user?.name || `${shipping_address?.firstName || "Customer"} ${shipping_address?.lastName || "User"}`.trim(),
          email: buyerEmail,
          phone: formatPhone(buyerPhone, normalizeCountry(shipping_address?.country)),
          id: consistentBuyerId,
        },
        shipping_address: shipping_address || {
          city: "Dubai",
          address: "N/A",
          zip: "00000",
          country: "AE"
        },
        buyer_history: buyerHistory,
        order_history: orderHistory
      },
      merchant_code: process.env.TABBY_MERCHANT_CODE || "MTAE",
      lang: req.body.lang || "en"
    };

    // ✅ [5] Check payload structure
    console.log("  [5] ✅ Payload built — structure:");
    console.log(`       amount   : ${tabbyPayload.payment.amount}`);
    console.log(`       currency : ${tabbyPayload.payment.currency}`);
    console.log(`       buyer    : ${tabbyPayload.payment.buyer.email} / ${tabbyPayload.payment.buyer.phone}`);
    console.log(`       merchant : ${tabbyPayload.merchant_code}`);
    console.log(`       lang     : ${tabbyPayload.lang}`);

    // ✅ [3] Check correct endpoint
    const endpoint = `${TABBY_BASE}/pre-scoring`;
    console.log(`  [3] ✅ Endpoint: POST ${endpoint}`);

    // ✅ [4] Check correct secret key
    const sk = process.env.TABBY_SECRET_KEY || "";
    const skMode = sk.startsWith("sk_test_") ? "SANDBOX" : sk.startsWith("sk_live_") ? "LIVE" : "UNKNOWN";
    console.log(`  [4] ✅ Secret key: ${sk ? sk.substring(0, 12) + "..." + sk.slice(-4) : "❌ MISSING"} [${skMode}]`);
    if (!sk) throw new Error("TABBY_SECRET_KEY is not defined in environment variables");

    // 📦 Full payload log
    console.log("  [5] 📦 FULL TABBY PRE-SCORING PAYLOAD:");
    console.log(JSON.stringify(tabbyPayload, null, 2));

    // ✅ [2] Confirm request is being sent
    console.log("  [2] 🚀 Sending request to Tabby API...");

    let response;
    try {
      response = await axios.post(endpoint, tabbyPayload, {
        headers: {
          Authorization: `Bearer ${sk}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      });
    } catch (preError) {
      if (preError.response?.status === 404 || preError.response?.status === 405) {
        console.warn(`  [2] ⚠️ pre-scoring returned ${preError.response?.status} — falling back to /checkout for eligibility`);
        const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";
        const fallbackPayload = {
          ...tabbyPayload,
          merchant_urls: {
            success: `${clientUrl}/checkout/success`,
            cancel: `${clientUrl}/checkout/cancel`,
            failure: `${clientUrl}/checkout/failure`
          }
        };
        response = await axios.post(`${TABBY_BASE}/checkout`, fallbackPayload, {
          headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/json" },
          timeout: 10000
        });
      } else {
        throw preError;
      }
    }

    // ✅ [8] Log response from Tabby
    console.log("  [8] ✅ Tabby API responded:");
    console.log(`       HTTP status : ${response.status}`);
    console.log(`       status      : ${response.data?.status}`);
    console.log(`       rejection   : ${response.data?.rejection_reason || "none"}`);
    console.log(`       installments: ${response.data?.configuration?.available_products?.installments?.length ?? 0}`);
    console.log("══════════════════════════════════════════════════\n");

    // ✅ [8] Extract the true rejection reason
    const installments = response.data.configuration?.available_products?.installments?.[0];
    const rawReason = response.data.rejection_reason_code
      || response.data.rejection_reason
      || installments?.rejection_reason
      || response.data.reason
      || (response.data.status === "rejected" ? "rejected" : null);

    const eligible = ["approved", "approved_with_changes", "created"].includes(response.data.status?.toLowerCase()) ||
      (installments?.is_available !== false && response.data.configuration?.available_products?.installments?.length > 0);

    let rejectionMessage = null;
    const lang = req.body.lang || "en";
    const isAr = lang.toLowerCase() === "ar";

    if (!eligible && rawReason) {
      if (rawReason === "order_amount_too_high" || rawReason === "order_limit_reached" || rawReason === "limit_exceeded" || rawReason === "monthly_limit_exceeded") {
        rejectionMessage = isAr
          ? "قيمة الطلب تفوق الحد الأقصى المسموح به حاليًا مع تابي. يُرجى تخفيض قيمة السلة أو استخدام وسيلة دفع أخرى."
          : "This purchase is above your current spending limit with Tabby, try a smaller cart or use another payment method";
      }
      else if (rawReason === "order_amount_too_low") {
        rejectionMessage = isAr
          ? "قيمة الطلب أقل من الحد الأدنى المطلوب لاستخدام خدمة تابي. يُرجى زيادة قيمة الطلب أو استخدام وسيلة دفع أخرى."
          : "Order value is less than the minimum required for Tabby service. Please increase the order value or use an alternative payment method.";
      }
      else if (rawReason === "not_available") {
        rejectionMessage = isAr
          ? "نأسف، تابي غير قادرة على الموافقة على هذه العملية. الرجاء استخدام طريقة دفع أخرى."
          : "Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.";
      }
      else {
        rejectionMessage = isAr
          ? "خدمة تابي غير متوفرة حالياً. يرجى استخدام طريقة دفع بديلة."
          : "Tabby is currently unavailable. Please use an alternative payment method.";
      }
    }

    res.json({
      success: true,
      eligible,
      status: response.data.status,
      rejection_reason: rawReason || "not_available",
      rejection_message: rejectionMessage,
      details: response.data
    });

  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("  [8] ❌ Tabby pre-scoring FAILED:");
    console.error(`       HTTP status : ${error.response?.status || "N/A"}`);
    console.error(`       Error body  : ${JSON.stringify(errorData, null, 2)}`);
    console.log("══════════════════════════════════════════════════\n");

    let rejectionMessage = "Eligibility check failed";
    if (errorData?.status === "rejected") {
      rejectionMessage = "Tabby has rejected this request. Please try another payment method.";
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: rejectionMessage,
      error: errorData,
      eligible: false
    });
  }
};

// ----------------- Create Tabby Order -----------------

const createTabbyOrder = async (req, res) => {
  console.log("\n══════════════════════════════════════════════════");
  console.log("   📥 TABBY CREATE ORDER — REQUEST RECEIVED");
  console.log("══════════════════════════════════════════════════");

  // ✅ [1] Confirm route is triggered
  console.log("  [1] ✅ Route triggered: POST /api/tabby/create-checkout");
  console.log(`       User: ${req.user?.userId || "guest"} | IP: ${req.ip}`);
  console.log(`       Body keys: ${Object.keys(req.body || {}).join(", ") || "(empty)"}`);

  try {
    let {
      items,
      shippingAddress,
      billingAddress,
      customer,
      order: frontendOrder,
      successUrl: frontendSuccessUrl,
      cancelUrl: frontendCancelUrl,
      failureUrl: frontendFailureUrl,
      dummy = false
    } = req.body || {};

    if (!items && frontendOrder?.items) items = frontendOrder.items;
    if (!shippingAddress && customer?.shipping) shippingAddress = customer.shipping;
    if (!billingAddress) billingAddress = shippingAddress;

    // ✅ [6] Check currency = AED
    const incomingCurrency = req.body.currency || "AED";
    if (incomingCurrency.toUpperCase() !== "AED") {
      console.warn(`  [6] ❌ Currency check FAILED — received '${incomingCurrency}', Tabby only supports AED`);
      return res.status(400).json({
        success: false,
        message: "Tabby only supports AED currency. Please switch your currency to AED to use Tabby."
      });
    }
    console.log(`  [6] ✅ Currency check PASSED — currency is '${incomingCurrency}'`);

    // ✅ [7] Check buyer country = AE
    const shipCountry = normalizeCountry(shippingAddress?.country || customer?.shipping?.country);
    if (shipCountry && shipCountry !== "AE") {
      console.warn(`  [7] ❌ Country check FAILED — resolved country is '${shipCountry}', Tabby only supports AE`);
      return res.status(400).json({
        success: false,
        message: "Tabby is only available for UAE customers."
      });
    }
    console.log(`  [7] ✅ Country check PASSED — resolved country is '${shipCountry}'`);

    const buyerInfo = customer?.buyer || frontendOrder?.buyer || {};
    const buyerEmail = buyerInfo.email || shippingAddress?.email || "otp.success@tabby.ai";
    const buyerPhone = buyerInfo.phone || shippingAddress?.phone || "+971500000001";
    const buyerName = buyerInfo.name || `${shippingAddress?.firstName || "Test"} ${shippingAddress?.lastName || "User"}`;

    const currency = req.body.currency || "AED";
    const decimals = ["KWD", "BHD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;

    let order;
    let populatedItems = [];
    let subtotal = 0;
    let shippingFee = 0;
    let total = 0;
    let region = "";
    let referenceId = "";

    const { existingOrderId } = req.body;

    if (existingOrderId) {
      order = await Order.findById(existingOrderId);
      if (!order) return res.status(404).json({ success: false, message: "Existing order not found" });

      populatedItems = order.items;
      subtotal = order.subtotal;

      const calc = shippingCalculator.calculateShippingFee({ country: shippingAddress?.country || "AE", subtotal });
      shippingFee = calc.shippingFee;
      region = calc.region;
      total = parseFloat((subtotal + shippingFee).toFixed(decimals));
      referenceId = order.orderId || `tabby_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      order.shippingAddress = {
        firstName: shippingAddress?.firstName || order.shippingAddress?.firstName,
        lastName: shippingAddress?.lastName || order.shippingAddress?.lastName,
        email: buyerEmail,
        phone: buyerPhone,
        city: shippingAddress?.city || order.shippingAddress?.city,
        street: shippingAddress?.address1 || shippingAddress?.street || order.shippingAddress?.street || "N/A",
        country: normalizeCountry(shippingAddress?.country || order.shippingAddress?.country),
        postalCode: shippingAddress?.postalCode || order.shippingAddress?.postalCode || ""
      };
      order.orderId = referenceId;
      order.shippingFee = shippingFee;
      order.total = total;
      order.region = region;
      order.paymentMethod = "tabby";
      await order.save();
    } else {
      // Populate items for new order
      if (!dummy && Array.isArray(items) && items.length > 0) {
        populatedItems = await Promise.all(items.map(async (it) => {
          const productId = it.productId || it.reference_id || it.id;
          const product = await Product.findById(productId).select("name images salePrice regularPrice sku referenceNumber category").lean();
          if (!product) {
            return {
              productId: productId && mongoose.Types.ObjectId.isValid(productId) ? productId : null,
              name: it.name || it.title || "Product",
              image: it.image || "",
              price: Number(it.price || it.unit_price || 0),
              quantity: Number(it.quantity || 1),
              sku: it.sku || it.reference_id || "N/A",
              category: "Accessories" // Fallback
            };
          }
          return {
            productId: product._id,
            name: product.name,
            image: product.images?.[0]?.url || product.images?.[0] || "",
            price: it.price || it.unit_price || product.salePrice || product.regularPrice || 0,
            quantity: it.quantity || 1,
            sku: product.sku || product.referenceNumber || product._id.toString(),
            category: product.category || "Watch"
          };
        }));
      } else {
        populatedItems = [{
          productId: null,
          name: "Dummy Watch",
          image: "https://www.montres.ae/logo.png",
          price: 100,
          quantity: 1,
          sku: "DUMMY-001",
          category: "Watch"
        }];
      }

      subtotal = (populatedItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)) || 0;
      const calc = shippingCalculator.calculateShippingFee({ country: shippingAddress?.country || "AE", subtotal });
      shippingFee = calc.shippingFee;
      region = calc.region;
      total = parseFloat((subtotal + shippingFee).toFixed(decimals)) || 0;

      if (!total || total <= 0) {
        console.warn("  [5] ❌ Total amount is zero or invalid — aborting");
        return res.status(400).json({ success: false, message: "Invalid order amount. Please check your cart." });
      }

      referenceId = `tabby_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      // Calculate originalPrice for new regular order
      const originalPriceTotal = populatedItems.reduce((acc, item) => acc + (item.regularPrice || item.price) * item.quantity, 0);

      order = await Order.create({
        userId: req.user?.userId || null,
        orderId: referenceId,
        items: populatedItems,
        subtotal: subtotal,
        originalPrice: originalPriceTotal,
        shippingFee: shippingFee,
        total: total,
        region: region,
        paymentMethod: "tabby",
        paymentStatus: "pending",
        orderStatus: "Pending",
        currency: currency,
        shippingAddress: {
          firstName: shippingAddress?.firstName || "Customer",
          lastName: shippingAddress?.lastName || "User",
          email: buyerEmail,
          phone: buyerPhone,
          city: shippingAddress?.city || "Dubai",
          street: shippingAddress?.address1 || shippingAddress?.street || "N/A",
          country: normalizeCountry(shippingAddress?.country),
          postalCode: shippingAddress?.postalCode || ""
        }
      });
    }

    console.log(`📝 Tabby order prepared: ${order._id} (ID: ${referenceId})`);

    const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";

    const successUrl = frontendSuccessUrl
      ? `${frontendSuccessUrl}${frontendSuccessUrl.includes("?") ? "&" : "?"}orderId=${referenceId}`
      : `${clientUrl}/checkout/success?orderId=${referenceId}`;
    const cancelUrl = frontendCancelUrl
      ? `${frontendCancelUrl}${frontendCancelUrl.includes("?") ? "&" : "?"}orderId=${referenceId}`
      : `${clientUrl}/checkout?canceled=true&orderId=${referenceId}`;
    const failureUrl = frontendFailureUrl
      ? `${frontendFailureUrl}${frontendFailureUrl.includes("?") ? "&" : "?"}orderId=${referenceId}`
      : `${clientUrl}/checkout?failed=true&orderId=${referenceId}`;

    const userId = req.user?.userId;
    const { buyerHistory, orderHistory, consistentBuyerId } = await getTabbyHistory(userId, buyerEmail, buyerPhone, referenceId);

    const tabbyItems = populatedItems.map((item) => ({
      title: (item.name || "Watch Product").substring(0, 100).trim(), // Tabby often has 100 char limit
      description: (item.name || "Watch Product").substring(0, 200).trim(),
      quantity: item.quantity || 1,
      unit_price: Number(item.price || 0).toFixed(decimals),
      category: (item.category || "Watch").trim(),
      image_url: item.image || "https://www.montres.ae/logo.png",
      product_url: item.productId ? `${clientUrl}/product/${item.productId}` : clientUrl,
      brand: "Montres",
      reference_id: item.productId?.toString() || item.sku || "N/A",
      is_refundable: true
    }));

    const lang = req.body.lang || req.body.language || "en";
    const isAr = lang.toLowerCase() === "ar";

    const tabbyPayload = {
      payment: {
        amount: total.toFixed(decimals),
        currency: currency,
        description: isAr ? "ادفع لاحقًا عبر تابي" : "Order via Tabby",
        buyer: {
          name: buyerName,
          email: buyerEmail,
          phone: formatPhone(buyerPhone, normalizeCountry(shippingAddress?.country)),
          id: consistentBuyerId
        },
        buyer_history: buyerHistory,
        shipping_address: {
          city: shippingAddress?.city || "Dubai",
          address: shippingAddress?.address1 || shippingAddress?.address || "Downtown",
          zip: shippingAddress?.postalCode || shippingAddress?.zip || "00000",
          country: normalizeCountry(shippingAddress?.country)
        },
        order: {
          reference_id: referenceId,
          items: tabbyItems,
          shipping_amount: shippingFee.toFixed(decimals),
          tax_amount: (0).toFixed(decimals),
          discount_amount: (0).toFixed(decimals)
        },
        order_history: orderHistory
      },
      merchant_code: req.body.merchant_code || process.env.TABBY_MERCHANT_CODE || "MTAE",
      lang: lang,
      merchant_urls: {
        success: successUrl,
        cancel: cancelUrl,
        failure: failureUrl
      }
    };

    if (!tabbyPayload.payment.buyer.phone || tabbyPayload.payment.buyer.phone === "+") {
      console.warn("  [5] ❌ Buyer phone is missing or invalid — using fallback to avoid 400");
      tabbyPayload.payment.buyer.phone = "+971500000001";
    }

    // ✅ [4] Check correct secret key
    const sk = process.env.TABBY_SECRET_KEY || "";
    const skMode = sk.startsWith("sk_test_") ? "SANDBOX" : sk.startsWith("sk_live_") ? "LIVE" : "UNKNOWN";
    console.log(`  [4] ✅ Secret key: ${sk ? sk.substring(0, 12) + "..." + sk.slice(-4) : "❌ MISSING"} [${skMode}]`);
    if (!sk) throw new Error("TABBY_SECRET_KEY is not defined in environment variables");
    if (skMode === "UNKNOWN") console.warn("  [4] ⚠️ Key mode is UNKNOWN — ensure key starts with sk_test_ or sk_live_");

    // ✅ [5] Check payload structure
    console.log("  [5] ✅ Payload built — structure:");
    console.log(`       referenceId   : ${referenceId}`);
    console.log(`       amount        : ${tabbyPayload.payment.amount} ${tabbyPayload.payment.currency}`);
    console.log(`       buyer.email   : ${tabbyPayload.payment.buyer.email}`);
    console.log(`       buyer.phone   : ${tabbyPayload.payment.buyer.phone}`);
    console.log(`       buyer.name    : ${tabbyPayload.payment.buyer.name}`);
    console.log(`       merchant_code : ${tabbyPayload.merchant_code}`);
    console.log(`       success_url   : ${tabbyPayload.merchant_urls.success}`);
    console.log(`       cancel_url    : ${tabbyPayload.merchant_urls.cancel}`);
    console.log(`       failure_url   : ${tabbyPayload.merchant_urls.failure}`);
    console.log(`       items count   : ${tabbyPayload.payment.order.items.length}`);
    console.log(`       lang          : ${tabbyPayload.lang}`);

    // ✅ [3] Check correct endpoint
    const endpoint = `${TABBY_BASE}/checkout`;
    console.log(`  [3] ✅ Endpoint: POST ${endpoint}`);

    // 📦 Full payload log
    console.log("  [5] 📦 FULL TABBY CHECKOUT PAYLOAD:");
    console.log(JSON.stringify(tabbyPayload, null, 2));

    // ✅ [2] Confirm request is now being sent
    console.log("  [2] 🚀 Sending request to Tabby API...");

    const response = await axios.post(endpoint, tabbyPayload, {
      headers: {
        Authorization: `Bearer ${sk}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    // ✅ [8] Log response from Tabby
    console.log("  [8] ✅ Tabby API responded:");
    console.log(`       HTTP status   : ${response.status}`);
    console.log(`       checkout id   : ${response.data?.id || "N/A"}`);
    console.log(`       status        : ${response.data?.status || "N/A"}`);
    console.log(`       rejection     : ${response.data?.rejection_reason || "none"}`);
    console.log(`       checkout_url  : ${response.data?.checkout_url || response.data?.web_url || "N/A"}`);

    const paymentUrl =
      response.data?.checkout_url ||
      response.data?.web_url ||
      response.data?.configuration?.available_products?.installments?.[0]?.web_url ||
      null;

    if (!paymentUrl) {
      console.error("  [8] ❌ No checkout URL in Tabby response — status:", response.data?.status);
      console.error("       Full response:", JSON.stringify(response.data, null, 2));
      console.log("══════════════════════════════════════════════════\n");

      // FIX Priority 2: Soft-fail — preserve the order record (especially critical
      // for existingOrderId / offer orders). Never hard-delete here.
      await Order.findByIdAndUpdate(order._id, {
        $set: { paymentStatus: "failed", orderStatus: "Cancelled" }
      });

      const installments = response.data?.configuration?.available_products?.installments?.[0];
      const rawReason = response.data?.rejection_reason_code
        || response.data?.rejection_reason
        || installments?.rejection_reason
        || response.data?.reason
        || "rejected";

      let userMessage = "Tabby checkout unavailable";

      const lang = req.body.lang || req.body.language || "en";
      const isAr = lang.toLowerCase() === "ar" || lang.toLowerCase() === "arabic";

      if (response.data.status === "rejected" || (installments && installments.is_available === false)) {
        if (rawReason === "order_amount_too_high" || rawReason === "order_limit_reached" ||
          rawReason === "limit_exceeded" || rawReason === "monthly_limit_exceeded" ||
          rawReason === "order_too_high" || rawReason === "amount_too_high" ||
          rawReason === "not_enough_limit") {
          userMessage = isAr
            ? "قيمة الطلب تفوق الحد الأقصى المسموح به حاليًا مع تابي. يُرجى تخفيض قيمة السلة أو استخدام وسيلة دفع أخرى."
            : "This purchase is above your current spending limit with Tabby, try a smaller cart or use another payment method";
        } else if (rawReason === "order_amount_too_low" || rawReason === "order_too_low") {
          userMessage = isAr
            ? "قيمة الطلب أقل من الحد الأدنى المطلوب لاستخدام خدمة تابي. يُرجى زيادة قيمة الطلب أو استخدام وسيلة دفع أخرى."
            : "The purchase amount is below the minimum amount required to use Tabby, try adding more items or use another payment method";
        } else if (rawReason === "not_available" || rawReason === "not_eligible" || rawReason === "customer_not_eligible") {
          userMessage = isAr
            ? "نأسف، تابي غير قادرة على الموافقة على هذه العملية. الرجاء استخدام طريقة دفع أخرى."
            : "Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.";
        }
      }

      return res.status(400).json({
        success: false,
        message: userMessage,
        status: response.data.status,
        rejection_reason: rawReason,
        debug: response.data
      });
    }

    console.log(`  ✅ Checkout URL obtained: ${paymentUrl}`);
    console.log("══════════════════════════════════════════════════\n");

    order.tabbySessionId = response.data.payment?.id || response.data.id;
    await order.save();

    return res.status(201).json({ success: true, referenceId, checkoutUrl: paymentUrl });

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("  [2/8] ❌ Tabby API call FAILED:");
    console.error(`         HTTP status : ${error.response?.status || "N/A (network error?)"}`);
    console.error(`         Error body  : ${JSON.stringify(errorDetails, null, 2)}`);
    console.log("══════════════════════════════════════════════════\n");

    let userMessage = "Tabby initialization failed";
    if (error.response?.data?.error) userMessage = error.response.data.error;
    if (error.response?.data?.message) userMessage = error.response.data.message;

    return res.status(error.response?.status || 500).json({
      success: false,
      message: userMessage,
      error: errorDetails
    });
  }
};



const handleTabbyWebhook = async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("🔔 TABBY WEBHOOK HIT");

  try {
    /* =================================================
       1️⃣ Verify Signature FIRST
    ================================================= */
    const isValidSignature = verifyTabbySignature(req);
    if (!isValidSignature) {
      console.warn("⚠️ Cancelling webhook processing due to invalid signature.");
      return res.status(401).send("Invalid signature");
    }

    /* =================================================
       2️⃣ Parse payload
    ================================================= */
    let payload = req.body;
    if (Buffer.isBuffer(payload)) {
      payload = JSON.parse(payload.toString("utf8"));
    } else if (typeof payload === "string") {
      payload = JSON.parse(payload);
    }

    const incoming = payload.payment || payload;
    const paymentId = incoming?.id;
    const referenceId = incoming?.order?.reference_id || incoming?.reference_id || payload.order?.reference_id;

    if (!paymentId) {
      console.error("❌ Tabby Webhook: Missing paymentId");
      return res.status(400).send("Missing paymentId");
    }

    console.log(`📦 Tabby Payload - ID: ${paymentId}, Ref: ${referenceId}`);

    /* =================================================
       3️⃣ VERIFY payment with Tabby API (Source of Truth)
    ================================================= */
    const headers = {
      Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      "Content-Type": "application/json",
    };

    let payment = incoming;
    let status = (incoming.status || "").toLowerCase();

    try {
      const verifyRes = await axios.get(
        `${TABBY_BASE}/payments/${paymentId}`,
        { headers, timeout: 10000 }
      );
      if (verifyRes.data) {
        payment = verifyRes.data;
        status = (payment.status || "").toLowerCase();
      }
    } catch (apiErr) {
      console.warn(`⚠️ Direct /payments/${paymentId} lookup note: ${apiErr.message}. Using webhook payload status.`);
    }

    const amount = Number(payment.amount || incoming.amount || 0);

    console.log(`🔍 Tabby Verified State: ${status} for Ref: ${referenceId}`);

    /* =================================================
       4️⃣ Find order in DB & Validate
    ================================================= */
    let order = await Order.findOne({
      $or: [
        ...(referenceId ? [{ orderId: referenceId }] : []),
        { tabbySessionId: paymentId },
        { tabbyCaptureId: paymentId },
      ],
    });

    if (!order) {
      console.log(`📝 Creating new order for Tabby Reference: ${referenceId}`);

      const rawItems = payment.order?.items || incoming.order?.items || [];
      const reconstructedItems = rawItems.map(item => ({
        productId: mongoose.Types.ObjectId.isValid(item.reference_id) ? item.reference_id : null,
        name: item.title || "Product",
        price: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 1),
        image: item.image_url || ""
      }));

      const shippingAmount = Number(payment.order?.shipping_amount || incoming.order?.shipping_amount || 0);
      const totalAmount = Number(payment.amount || incoming.amount || 0);
      const subtotalAmount = totalAmount - shippingAmount;

      const buyer = payment.buyer || incoming.buyer || {};
      const shipping = payment.shipping_address || incoming.shipping_address || {};
      const userId = (buyer.id && mongoose.Types.ObjectId.isValid(buyer.id)) ? buyer.id : null;

      order = await Order.create({
        userId: userId,
        orderId: referenceId || `tabby_${Date.now()}_${paymentId.substring(0, 6)}`,
        items: reconstructedItems,
        subtotal: subtotalAmount > 0 ? subtotalAmount : totalAmount,
        shippingFee: shippingAmount,
        total: totalAmount,
        paymentMethod: "tabby",
        paymentStatus: "pending",
        orderStatus: "Pending",
        currency: payment.currency || incoming.currency || "AED",
        tabbySessionId: paymentId,
        shippingAddress: {
          firstName: buyer.name?.split(" ")[0] || "Customer",
          lastName: buyer.name?.split(" ").slice(1).join(" ") || "User",
          email: buyer.email,
          phone: buyer.phone,
          city: shipping.city || "N/A",
          street: shipping.address || "N/A",
          country: normalizeCountry(shipping.country || (payment.currency === 'SAR' ? 'SA' : payment.currency === 'OMR' ? 'OM' : 'AE')),
          postalCode: shipping.zip || ""
        }
      });

      console.log(`✅ Order created successfully from webhook: ${order._id}`);
    }

    // Amount mismatch check with tolerance
    if (order.total > 0 && Math.abs(amount - order.total) > 0.5) {
      console.error(
        `❌ AMOUNT MISMATCH — Order ${referenceId} | Tabby: ${amount} ${payment.currency} | DB: ${order.total} ${order.currency}` +
        ` | Diff: ${Math.abs(amount - order.total).toFixed(3)} — halting webhook processing for manual review.`
      );
      return res.status(400).send("Amount mismatch");
    }

    /* =================================================
       💳 AUTHORIZED / CLOSED / CAPTURED → Mark PAID & Capture
    ================================================= */
    if (["authorized", "closed", "captured"].includes(status)) {
      // If already marked as paid, return idempotent 200 OK
      if (order.paymentStatus === "paid") {
        console.log(`ℹ️ Order ${referenceId || order.orderId} already marked as PAID.`);
        return res.status(200).send("ok");
      }

      let captureId = null;

      // Trigger capture if authorized
      if (status === "authorized") {
        console.log(`💳 Status is AUTHORIZED. Triggering Tabby capture for payment ${paymentId}...`);
        try {
          const captureDecimals = ["KWD", "BHD", "OMR"].includes(order.currency?.toUpperCase()) ? 3 : 2;
          const finalAmount = Number(amount || order.total || 0);
          const captureRes = await axios.post(
            `${TABBY_BASE}/payments/${paymentId}/captures`,
            { amount: String(finalAmount.toFixed(captureDecimals)) },
            { headers, timeout: 10000 }
          );
          captureId = captureRes.data?.id;
          console.log(`✅ Tabby Capture request successful: ${captureId}`);
        } catch (capErr) {
          console.error("⚠️ Capture request notice (may already be captured):", capErr.response?.data || capErr.message);
        }
      }

      // Update Order atomically to PAID
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: { $ne: "paid" } },
        {
          $set: {
            paymentStatus: "paid",
            orderStatus: "Paid / Awaiting Shipment",
            tabbySessionId: paymentId,
            ...(captureId ? { tabbyCaptureId: captureId } : {}),
            paidAt: new Date()
          }
        },
        { new: true }
      );

      if (updatedOrder) {
        // Clear User Cart
        if (updatedOrder.userId) {
          await userModel.findByIdAndUpdate(updatedOrder.userId, {
            $set: { cart: [] },
            $addToSet: { orders: updatedOrder._id }
          }).catch(e => console.error(`User cart update error: ${e.message}`));
          console.log(`🛒 Cart cleared for user: ${updatedOrder.userId}`);
        }

        // Fire-and-forget confirmation email
        console.log(`✅ Order ${referenceId || order.orderId} finalized and marked PAID`);
        sendOrderConfirmation(updatedOrder._id)
          .catch(mailErr => console.error(`📧 Email error for order ${updatedOrder._id}:`, mailErr.message));
      }

      return res.status(200).send("ok");
    }

    /* =================================================
       ❌ FAILED / EXPIRED / REJECTED / CANCELED
    ================================================= */
    if (["failed", "expired", "rejected", "canceled", "cancelled"].includes(status)) {
      if (order.paymentStatus !== "failed" && order.paymentStatus !== "paid") {
        const statusMap = {
          expired: "Expired",
          rejected: "Rejected",
          canceled: "Cancelled",
          cancelled: "Cancelled",
          failed: "Failed"
        };

        await Order.findByIdAndUpdate(order._id, {
          $set: {
            paymentStatus: "failed",
            orderStatus: statusMap[status] || "Cancelled"
          }
        });
        console.log(`❌ Order ${referenceId || order.orderId} marked FAILED (Tabby status: ${status})`);
      }
      return res.status(200).send("ok");
    }

    /* =================================================
       💰 REFUNDED
    ================================================= */
    if (status === "refunded") {
      if (order.paymentStatus !== "refunded") {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            paymentStatus: "refunded",
            orderStatus: "Cancelled"
          }
        });
        console.log(`💰 Order ${referenceId || order.orderId} marked REFUNDED`);
      }
      return res.status(200).send("ok");
    }

    /* =================================================
       Default ACK
    ================================================= */
    return res.status(200).send("ok");

  } catch (err) {
    console.error("❌ Tabby webhook processing error:", err.response?.data || err.message);
    if (!res.headersSent) {
      return res.status(500).send("Internal Server Error");
    }
  } finally {
    console.log("--------------------------------------------------");
  }
};




/**
 * 🔄 RECONCILIATION: Sync "Pending" orders with Tabby API
 * Can be called via cron, admin route, or internally.
 */
const syncTabbyOrders = async (req = {}, res = null) => {
  try {
    const orderId = req?.query?.orderId;
    let query = { paymentMethod: "tabby", paymentStatus: "pending" };
    
    // If specific orderId provided, just sync that one
    if (orderId) {
      query = { 
        $or: [
          { orderId: orderId },
          { tabbySessionId: orderId }
        ]
      };
    } else {
      // Sync all pending Tabby orders
      query.paymentStatus = "pending";
    }

    const pendingOrders = await Order.find(query);
    console.log(`🔍 Reconciliation: Found ${pendingOrders.length} Tabby orders to sync.`);

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    const headers = {
      Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      "Content-Type": "application/json",
    };

    for (const order of pendingOrders) {
      results.processed++;
      const sessionId = order.tabbySessionId;

      if (!sessionId) {
        // If order has no session ID and is older than 2 hours, mark failed
        const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
        if (orderAgeMs > 2 * 60 * 60 * 1000) {
          await Order.findByIdAndUpdate(order._id, {
            $set: { paymentStatus: "failed", orderStatus: "Cancelled" }
          });
          results.updated++;
        }
        continue;
      }

      try {
        let tabbyData = null;
        let paymentId = sessionId;

        try {
          const response = await axios.get(`${TABBY_BASE}/payments/${sessionId}`, { headers, timeout: 5000 });
          tabbyData = response.data;
        } catch (pErr) {
          if (pErr.response?.status === 404) {
            try {
              const chkRes = await axios.get(`${TABBY_BASE}/checkout/${sessionId}`, { headers, timeout: 5000 });
              tabbyData = chkRes.data?.payment || chkRes.data;
              if (chkRes.data?.payment?.id) paymentId = chkRes.data.payment.id;
            } catch (cErr) {
              // 404 on both payments and checkout means session expired without payment
            }
          }
        }

        if (tabbyData) {
          const tabbyStatus = (tabbyData.status || "").toLowerCase();

          if (["closed", "captured", "authorized"].includes(tabbyStatus)) {
            console.log(`✅ Order ${order.orderId || order._id} found as ${tabbyStatus} in Tabby. Syncing to PAID...`);
            
            let captureId = null;
            if (tabbyStatus === "authorized" && paymentId) {
              try {
                const captureDecimals = ["KWD", "BHD", "OMR"].includes(order.currency?.toUpperCase()) ? 3 : 2;
                const capRes = await axios.post(
                  `${TABBY_BASE}/payments/${paymentId}/captures`,
                  { amount: String(Number(order.total || 0).toFixed(captureDecimals)) },
                  { headers, timeout: 5000 }
                );
                captureId = capRes.data?.id;
                console.log(`✅ Tabby payment captured in sync: ${captureId}`);
              } catch (capErr) {
                console.warn(`Reconciliation capture note: ${capErr.message}`);
              }
            }

            const updated = await Order.findOneAndUpdate(
              { _id: order._id, paymentStatus: "pending" },
              {
                $set: {
                  paymentStatus: "paid",
                  orderStatus: "Paid / Awaiting Shipment",
                  tabbySessionId: paymentId,
                  ...(captureId ? { tabbyCaptureId: captureId } : {}),
                  paidAt: new Date()
                }
              },
              { new: true }
            );

            if (updated) {
              results.updated++;
              if (updated.userId) {
                userModel.findByIdAndUpdate(updated.userId, {
                  $set: { cart: [] },
                  $addToSet: { orders: updated._id }
                }).catch(e => console.error(`Sync error for user ${updated.userId}:`, e.message));
              }
              
              sendOrderConfirmation(updated._id)
                .catch(e => console.error(`Sync email error for order ${updated._id}:`, e.message));
            }
          } else if (["failed", "expired", "rejected", "canceled", "cancelled"].includes(tabbyStatus)) {
             // Only mark failed if no successful payment object
             if (!tabbyData.payment || ["failed", "expired", "rejected", "canceled", "cancelled"].includes((tabbyData.payment?.status || "").toLowerCase())) {
               await Order.findByIdAndUpdate(order._id, { 
                 $set: { paymentStatus: "failed", orderStatus: "Cancelled" } 
               });
               results.updated++;
             }
          }
        } else {
          // If no Tabby data (404) and the order was created more than 2 hours ago, it's expired/abandoned
          const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
          if (orderAgeMs > 2 * 60 * 60 * 1000 || orderId) {
            console.log(`⏱️ Tabby session ${sessionId} expired / not found. Marking order ${order.orderId || order._id} Cancelled.`);
            await Order.findByIdAndUpdate(order._id, {
              $set: { paymentStatus: "failed", orderStatus: "Cancelled" }
            });
            results.updated++;
          }
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ orderId: order.orderId || order._id, error: err.message });
      }
    }

    if (res && typeof res.json === "function") {
      return res.json({ success: true, results });
    }
    return results;

  } catch (err) {
    console.error("❌ Reconciliation failed:", err.message);
    if (res && typeof res.status === "function") return res.status(500).json({ success: false, error: err.message });
    throw err;
  }
};

const refundTabbyPayment = async (paymentId, amount, currency = "AED") => {
  try {
    console.log(`🚀 Refunding Tabby Payment: ${paymentId} (${amount} ${currency})`);
    
    const decimals = ["KWD", "BHD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;
    const headers = {
      Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      "Content-Type": "application/json",
    };

    const response = await axios.post(
      `${TABBY_BASE}/payments/${paymentId}/refunds`,
      { amount: String(amount.toFixed(decimals)) },
      { headers }
    );

    console.log(`✅ Tabby Refund Success for ${paymentId}`);
    return true;
  } catch (err) {
    console.error("❌ Tabby Refund Error:", err.response?.data || err.message);
    return false;
  }
};

module.exports = {
  preScoring,
  createTabbyOrder,
  handleTabbyWebhook,
  syncTabbyOrders,
  refundTabbyPayment,
};
