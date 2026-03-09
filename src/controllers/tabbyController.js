require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/OrderModel");
const userModel = require('../models/UserModel');
const Product = require("../models/product");
const shippingCalculator = require("../utils/shippingCalculator");
const sendOrderConfirmation = require("../utils/sendOrderConfirmation");

// ✅ Helper to get Tabby history
const getTabbyHistory = async (userId) => {
  let buyerHistory = {
    registered_since: new Date().toISOString(),
    loyalty_level: 0,
    wishlist_count: 0,
    is_social_networks_connected: false,
    is_phone_number_verified: true,
    is_email_verified: true
  };

  let orderHistory = [];

  if (userId && /^[0-9a-fA-F]{24}$/.test(userId)) {
    const user = await userModel.findById(userId);
    if (user) {
      // Calculate loyalty level: Number of successful orders (any payment method)
      const successCount = await Order.countDocuments({
        userId: userId,
        $or: [{ paymentStatus: 'paid' }, { orderStatus: 'Completed' }]
      });

      buyerHistory = {
        registered_since: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
        loyalty_level: successCount,
        wishlist_count: user.wishlistGroups?.reduce((acc, g) => acc + (g.items?.length || 0), 0) || 0,
        is_social_networks_connected: !!user.googleId,
        is_phone_number_verified: true,
        is_email_verified: true
      };
    }

    // Include all relevant statuses: Paid / Completed, Cancelled, Failed
    const pastOrders = await Order.find({ userId: userId })
      .limit(20)
      .sort({ createdAt: -1 });

    orderHistory = pastOrders.map(o => {
      let tabbyStatus = 'new';
      if (o.paymentStatus === 'paid' || o.orderStatus === 'Completed') tabbyStatus = 'paid';
      else if (o.orderStatus === 'Cancelled' || o.paymentStatus === 'closed') tabbyStatus = 'cancelled';
      else if (o.paymentStatus === 'failed') tabbyStatus = 'failed';
      else if (o.paymentStatus === 'refunded') tabbyStatus = 'refunded';
      else if (o.paymentStatus === 'authorized') tabbyStatus = 'authorized';
      else if (o.paymentStatus === 'pending') tabbyStatus = 'new';

      return {
        purchased_at: o.createdAt.toISOString(),
        amount: Number(parseFloat(o.total || 0).toFixed(2)),
        currency: o.currency || "AED",
        status: tabbyStatus,
        payment_method: (o.paymentMethod === 'stripe' || o.paymentMethod === 'card') ? 'card' : o.paymentMethod || 'other',
        buyer: {
          phone: formatPhone(o.shippingAddress?.phone),
          email: o.shippingAddress?.email,
          name: `${o.shippingAddress?.firstName || ''} ${o.shippingAddress?.lastName || ''}`.trim() || 'Customer'
        },
        shipping_address: {
          city: o.shippingAddress?.city || "Dubai",
          address: o.shippingAddress?.street || o.shippingAddress?.address1 || "N/A",
          zip: o.shippingAddress?.postalCode || "00000"
        },
        order_id: o.orderId || o._id.toString()
      };
    });
  }

  return { buyerHistory, orderHistory };
};

// ✅ Helper to format phone to E.164 (Required by Tabby)
const formatPhone = (p) => {
  if (!p) return undefined;
  let cleaned = p.replace(/\D/g, "");
  if (cleaned.startsWith("971")) return "+" + cleaned;
  if (cleaned.startsWith("05")) return "+971" + cleaned.substring(1);
  if (cleaned.length === 9 && cleaned.startsWith("5")) return "+971" + cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.substring(2);
  return "+" + cleaned;
};

// ✅ Helper to normalize country to ISO-2
const normalizeCountry = (c) => {
  if (!c) return "AE";
  const upper = c.toString().trim().toUpperCase();
  if (upper === "UNITED ARAB EMIRATES" || upper === "UAE" || upper === "AE" || upper === "DUBAI") return "AE";
  if (upper === "SAUDI ARABIA" || upper === "SAUDI" || upper === "KSA" || upper === "SA") return "SA";
  if (upper === "OMAN" || upper === "OM") return "OM";
  if (upper === "KUWAIT" || upper === "KW") return "KW";
  if (upper === "BAHRAIN" || upper === "BH") return "BH";
  if (upper === "QATAR" || upper === "QA") return "QA";
  return upper.length === 2 ? upper : "AE";
};

// ✅ 1. Pre-Scoring
const preScoring = async (req, res) => {
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
      return res.status(400).json({
        success: false,
        message: "Amount and currency are required for eligibility check",
      });
    }

    const userId = req.user?.userId;
    const { buyerHistory, orderHistory } = await getTabbyHistory(userId);

    currency = req.body.currency || "AED";
    const decimals = ["KWD", "BHD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;

    const tabbyPayload = {
      payment: {
        amount: Number(parseFloat(amount).toFixed(decimals)),
        currency: currency,
        buyer: {
          email: buyer?.email,
          name: buyer?.name,
          phone: formatPhone(buyer?.phone),
          id: userId || "guest_" + Date.now(),
        },
        shipping_address: {
          city: shipping_address?.city || "Dubai",
          address: shipping_address?.address || shipping_address?.address1 || "N/A",
          zip: shipping_address?.zip || shipping_address?.postalCode || "00000",
          country: normalizeCountry(shipping_address?.country)
        },
        buyer_history: buyerHistory,
        order_history: orderHistory,
      },
      merchant_code: req.body.merchant_code || process.env.TABBY_MERCHANT_CODE || "MTAE",
    };

    let response;
    try {
      response = await axios.post(
        "https://api.tabby.ai/api/v2/pre-scoring",
        tabbyPayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10000
        }
      );
    } catch (preError) {
      if (preError.response?.status === 404 || preError.response?.status === 405) {
        console.warn(`⚠️ Tabby pre-scoring endpoint returned ${preError.response?.status}. Falling back to checkout endpoint for eligibility.`);

        const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";
        const fallbackPayload = {
          ...tabbyPayload,
          merchant_urls: {
            success: `${clientUrl}/checkout/success`,
            cancel: `${clientUrl}/checkout/cancel`,
            failure: `${clientUrl}/checkout/failure`
          },
          lang: req.body.lang || "en"
        };

        response = await axios.post(
          "https://api.tabby.ai/api/v2/checkout",
          fallbackPayload,
          {
            headers: {
              Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 10000
          }
        );
      } else {
        throw preError;
      }
    }

    const eligible = ["approved", "approved_with_changes", "created"].includes(response.data.status?.toLowerCase()) ||
      (response.data.configuration?.available_products?.installments?.length > 0);

    res.json({
      success: true,
      eligible: eligible,
      status: response.data.status,
      rejection_reason: response.data.rejection_reason,
      details: response.data,
    });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("Tabby pre-scoring error:", JSON.stringify(errorData, null, 2));

    // Localization for error message
    const lang = req.body.lang || "en";
    let message = "Eligibility check failed";
    if (error.response?.data?.status === 'rejected') {
      message = lang === 'ar' ? "عذراً، تابي غير متاح لهذا الطلب حالياً." : "Sorry, Tabby is not available for this order at the moment.";
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: message,
      rejection_reason: error.response?.data?.rejection_reason,
      error: errorData,
      eligible: false,
    });
  }
};


// ✅ 2. Create Session (Used for generic checkout initialization)
const createSession = async (req, res) => {
  try {
    const { payment, merchant_urls, merchant_code, lang } = req.body;
    const userId = req.user?.userId || req.body.userId;
    const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";

    if (!payment || !payment.order) {
      return res.status(400).json({ success: false, message: "Invalid payment data" });
    }

    const referenceId = `tabby_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const { buyerHistory, orderHistory } = await getTabbyHistory(userId);

    const tabbyPayload = {
      payment: {
        ...payment,
        amount: Number(parseFloat(payment.amount).toFixed(2)),
        currency: payment.currency || "AED",
        description: `Order Session ${referenceId}`,
        buyer: {
          email: payment.buyer?.email,
          name: payment.buyer?.name,
          phone: formatPhone(payment.buyer?.phone),
          id: userId || referenceId,
        },
        shipping_address: {
          city: payment.shipping_address?.city || "Dubai",
          address: payment.shipping_address?.address || payment.shipping_address?.address1 || "N/A",
          zip: payment.shipping_address?.zip || payment.shipping_address?.postalCode || "00000",
          country: normalizeCountry(payment.shipping_address?.country)
        },
        buyer_history: buyerHistory,
        order: {
          ...payment.order,
          reference_id: referenceId,
          items: payment.order.items.map(item => ({
            title: item.title || item.name || "Product",
            quantity: Number(item.quantity) || 1,
            unit_price: Number(parseFloat(item.unit_price || 0).toFixed(2)),
            image_url: item.image_url || item.image || "",
            product_url: item.product_url || `${clientUrl}/product/${item.productId || ''}`,
            brand: item.brand || "Montres",
            is_refundable: item.is_refundable !== undefined ? item.is_refundable : true,
            category: item.category || "Watch",
            reference_id: item.productId
          })),
          shipping_amount: Number(parseFloat(payment.order?.shipping_amount || 0).toFixed(2)),
          tax_amount: Number(parseFloat(payment.order?.tax_amount || 0).toFixed(2))
        },
        order_history: orderHistory
      },
      lang: lang || "en",
      merchant_code: merchant_code || process.env.TABBY_MERCHANT_CODE || "MTAE",
      merchant_urls: {
        success: (merchant_urls?.success || merchant_urls?.success_url)
          ? `${(merchant_urls?.success || merchant_urls?.success_url)}${(merchant_urls?.success || merchant_urls?.success_url).includes('?') ? '&' : '?'}orderId=${referenceId}`
          : `${clientUrl}/checkout/success?orderId=${referenceId}`,
        cancel: (merchant_urls?.cancel || merchant_urls?.cancel_url)
          ? `${(merchant_urls?.cancel || merchant_urls?.cancel_url)}${(merchant_urls?.cancel || merchant_urls?.cancel_url).includes('?') ? '&' : '?'}orderId=${referenceId}`
          : `${clientUrl}/checkout?canceled=true&orderId=${referenceId}`,
        failure: (merchant_urls?.failure || merchant_urls?.failure_url)
          ? `${(merchant_urls?.failure || merchant_urls?.failure_url)}${(merchant_urls?.failure || merchant_urls?.failure_url).includes('?') ? '&' : '?'}orderId=${referenceId}`
          : `${clientUrl}/checkout?failed=true&orderId=${referenceId}`,
      },
    };

    if (!tabbyPayload.payment.buyer.phone || tabbyPayload.payment.buyer.phone === "+") {
      tabbyPayload.payment.buyer.phone = "+971500000001";
    }

    const response = await axios.post("https://api.tabby.ai/api/v2/checkout", tabbyPayload, {
      headers: {
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const checkoutUrl = response.data?.checkout_url || response.data?.web_url || response.data?.configuration?.available_products?.installments?.[0]?.web_url || null;

    if (!checkoutUrl) {
      return res.status(400).json({ success: false, message: "Checkout URL not received from Tabby" });
    }

    res.status(200).json({ success: true, id: response.data.id, checkoutUrl });
  } catch (error) {
    console.log("Tabby session error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Failed to create Tabby session" });
  }
};

// ✅ 3. Create Tabby Checkout Order (Session only - No DB Storage)
const createTabbyOrder = async (req, res) => {
  try {
    let { items, shippingAddress, billingAddress, customer, order: frontendOrder, successUrl: frontendSuccessUrl, cancelUrl: frontendCancelUrl, failureUrl: frontendFailureUrl, dummy = false } = req.body || {};

    if (!items && frontendOrder?.items) items = frontendOrder.items;
    if (!shippingAddress && customer?.shipping) shippingAddress = customer.shipping;
    if (!billingAddress) billingAddress = shippingAddress;

    const buyerInfo = customer?.buyer || frontendOrder?.buyer || {};
    const buyerEmail = buyerInfo.email || shippingAddress?.email || "otp.success@tabby.ai";
    const buyerPhone = buyerInfo.phone || shippingAddress?.phone || "+971500000001";
    const buyerName = buyerInfo.name || `${shippingAddress?.firstName || "Test"} ${shippingAddress?.lastName || "User"}`;

    let populatedItems = [];
    if (!dummy && Array.isArray(items) && items.length > 0) {
      populatedItems = await Promise.all(
        items.map(async (it) => {
          const productId = it.productId || it.reference_id || it.id;
          const product = await Product.findById(productId)
            .select("name images salePrice sku referenceNumber")
            .lean();

          if (!product) {
            return {
              productId: productId && mongoose.Types.ObjectId.isValid(productId) ? productId : null,
              name: it.name || it.title || "Product",
              image: it.image || "",
              price: Number(it.price || it.unit_price || 0),
              quantity: Number(it.quantity || 1),
              sku: it.sku || it.reference_id || "N/A"
            };
          }

          return {
            productId: product._id,
            name: product.name,
            image: product.images?.[0]?.url || product.images?.[0] || "",
            price: product.salePrice || 0,
            quantity: it.quantity || 1,
            sku: product.sku || product.referenceNumber || product._id.toString()
          };
        })
      );
    } else {
      populatedItems = [{ productId: null, name: "Dummy Watch", image: "https://www.montres.ae/logo.png", price: 100, quantity: 1, sku: "DUMMY-001" }];
    }

    const currency = req.body.currency || "AED";
    const decimals = ["KWD", "BHD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;

    const subtotal = populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const { shippingFee, region } = shippingCalculator.calculateShippingFee({ country: shippingAddress?.country || "AE", subtotal });
    const total = Number((subtotal + shippingFee).toFixed(decimals));

    const referenceId = `tabby_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // ✅ NEW: Create order in database first
    const newOrder = await Order.create({
      userId: req.user?.userId || null,
      orderId: referenceId,
      items: populatedItems,
      subtotal: subtotal,
      shippingFee: shippingFee,
      total: total,
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

    console.log(`📝 Pending Tabby order created: ${newOrder._id} (ID: ${referenceId})`);

    const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";
    const successUrl = frontendSuccessUrl
      ? `${frontendSuccessUrl}${frontendSuccessUrl.includes('?') ? '&' : '?'}orderId=${referenceId}`
      : `${clientUrl}/checkout/success?orderId=${referenceId}`;
    const cancelUrl = frontendCancelUrl
      ? `${frontendCancelUrl}${frontendCancelUrl.includes('?') ? '&' : '?'}orderId=${referenceId}`
      : `${clientUrl}/checkout?canceled=true&orderId=${referenceId}`;
    const failureUrl = frontendFailureUrl
      ? `${frontendFailureUrl}${frontendFailureUrl.includes('?') ? '&' : '?'}orderId=${referenceId}`
      : `${clientUrl}/checkout?failed=true&orderId=${referenceId}`;

    const { buyerHistory, orderHistory } = await getTabbyHistory(req.user?.userId);

    const tabbyItems = populatedItems.map((item) => ({
      title: item.name,
      description: item.name,
      quantity: item.quantity,
      unit_price: Number(item.price || 0).toFixed(2),
      category: "Watch",
      image_url: item.image || "https://www.montres.ae/logo.png",
      product_url: item.productId ? `${clientUrl}/product/${item.productId}` : clientUrl,
      brand: "Montres",
      reference_id: item.productId?.toString() || item.sku || "N/A",
      is_refundable: true
    }));

    const tabbyPayload = {
      payment: {
        amount: total,
        currency: currency,
        description: `Order via Tabby`,
        buyer: {
          id: req.user?.userId || "guest_" + Date.now(),
          email: buyerEmail,
          name: buyerName,
          phone: formatPhone(buyerPhone),
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
          shipping_amount: Number(shippingFee.toFixed(decimals)),
          tax_amount: 0
        },
        order_history: orderHistory,
      },
      merchant_code: req.body.merchant_code || process.env.TABBY_MERCHANT_CODE || "MTAE",
      lang: req.body.lang || req.body.language || "en",
      merchant_urls: { success: successUrl, cancel: cancelUrl, failure: failureUrl },
    };

    console.log("🟠 Sending Tabby Payload:", JSON.stringify(tabbyPayload, null, 2));

    const response = await axios.post("https://api.tabby.ai/api/v2/checkout", tabbyPayload, {
      headers: {
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    const paymentUrl = response.data?.checkout_url || response.data?.web_url || response.data?.configuration?.available_products?.installments?.[0]?.web_url || null;

    if (!paymentUrl) {
      // Cleanup if failed
      await Order.findByIdAndDelete(newOrder._id);

      const rejectionReason = response.data.rejection_reason;
      const lang = req.body.lang || req.body.language || "en";
      let userMessage = response.data.status === "rejected" ? "Tabby has rejected this order" : "Tabby checkout unavailable";

      if (rejectionReason === 'not_eligible' || rejectionReason === 'customer_not_eligible') {
        userMessage = lang === 'ar'
          ? "نأسف، تابي غير قادرة على الموافقة على هذه العملية. الرجاء استخدام طريقة دفع أخرى."
          : "Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.";
      } else if (rejectionReason === 'order_amount_too_high' || rejectionReason === 'not_enough_limit') {
        userMessage = lang === 'ar'
          ? "قيمة الطلب تفوق الحد الأقصى المسموح به حاليًا مع تابي. يُرجى تخفيض قيمة السلة أو استخدام وسيلة دفع أخرى."
          : "This purchase is above your current spending limit with Tabby, try a smaller cart or use another payment method";
      } else if (rejectionReason === 'order_amount_too_low') {
        userMessage = lang === 'ar'
          ? "قيمة الطلب أقل من الحد الأدنى المطلوب لاستخدام خدمة تابي. يُرجى زيادة قيمة الطلب أو استخدام وسيلة دفع أخرى."
          : "The purchase amount is below the minimum amount required to use Tabby, try adding more items or use another payment method";
      }

      return res.status(400).json({
        success: false,
        message: userMessage,
        rejection_reason: rejectionReason,
        status: response.data.status,
        debug: response.data
      });
    }

    // Save session ID to order
    newOrder.tabbySessionId = response.data.id;
    await newOrder.save();

    return res.status(201).json({ success: true, referenceId, checkoutUrl: paymentUrl });
  } catch (error) {
    console.error("❌ Tabby error details:", JSON.stringify(error.response?.data || error.message, null, 2));
    return res.status(500).json({
      success: false,
      message: "Tabby initialization failed",
      error: error.response?.data || error.message
    });
  }
};

// ✅ 3. Tabby Webhook Handler
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"] || req.headers["x-tabby-signature"];

    let payload = req.body;
    if (Buffer.isBuffer(req.body)) payload = JSON.parse(req.body.toString("utf8"));

    const payment = payload.payment || payload;
    const paymentId = payment.id || payload.id;
    const referenceId = payment.order?.reference_id || payment.reference_id || payload.reference_id;
    const status = (payment.status || payload.status)?.toLowerCase();

    console.log(`🔔 Tabby Webhook: ${referenceId} - Status: ${status}`);

    // Respond 200 immediately
    res.sendStatus(200);

    if (status === "captured" || status === "authorized" || status === "closed") {
      let order = await Order.findOne({ $or: [{ orderId: referenceId }, { tabbySessionId: paymentId }] });

      if (!order && (status === "captured" || status === "authorized" || (status === "closed" && payment.captures?.length > 0))) {
        console.log(`📝 Creating new order for Tabby Reference: ${referenceId}`);

        const rawItems = payment.order?.items || [];
        const reconstructedItems = rawItems.map(item => ({
          productId: mongoose.Types.ObjectId.isValid(item.reference_id) ? item.reference_id : null,
          name: item.title,
          price: Number(item.unit_price),
          quantity: Number(item.quantity),
          image: item.image_url || ""
        }));

        const shippingAmount = Number(payment.order?.shipping_amount || 0);
        const totalAmount = Number(payment.amount);
        const subtotal = totalAmount - shippingAmount;

        const buyer = payment.buyer || {};
        const shipping = payment.shipping_address || {};

        const userId = (buyer.id && mongoose.Types.ObjectId.isValid(buyer.id)) ? buyer.id : null;

        order = await Order.create({
          userId: userId,
          orderId: referenceId,
          items: reconstructedItems,
          subtotal: subtotal,
          shippingFee: shippingAmount,
          total: totalAmount,
          paymentMethod: "tabby",
          paymentStatus: "paid",
          orderStatus: "Processing",
          currency: payment.currency || "AED",
          tabbySessionId: paymentId,
          shippingAddress: {
            firstName: buyer.name?.split(" ")[0] || "Customer",
            lastName: buyer.name?.split(" ").slice(1).join(" ") || "User",
            email: buyer.email,
            phone: buyer.phone,
            city: shipping.city || "N/A",
            street: shipping.address || "N/A",
            country: shipping.country || (payment.currency === 'SAR' ? 'SA' : payment.currency === 'OMR' ? 'OM' : 'AE'),
            postalCode: shipping.zip || ""
          },
          billingAddress: {
            firstName: buyer.name?.split(" ")[0] || "Customer",
            lastName: buyer.name?.split(" ").slice(1).join(" ") || "User",
            email: buyer.email,
            phone: buyer.phone,
            city: shipping.city || "N/A",
            street: shipping.address || "N/A",
            country: shipping.country || (payment.currency === 'SAR' ? 'SA' : payment.currency === 'OMR' ? 'OM' : 'AE'),
            postalCode: shipping.zip || ""
          }
        });

        console.log(`✅ Order created successfully: ${order._id}`);

        if (userId) {
          await userModel.findByIdAndUpdate(userId, { $set: { cart: [] } });
        }

        await sendOrderConfirmation(order._id);
      } else if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "paid";
        order.orderStatus = "Processing";
        order.tabbySessionId = paymentId;
        await order.save();

        if (order.userId) {
          await userModel.findByIdAndUpdate(order.userId, { $set: { cart: [] } });
        }

        await sendOrderConfirmation(order._id);
      }
    } else if (status === "expired" || status === "rejected" || status === "cancelled") {
      let order = await Order.findOne({ $or: [{ orderId: referenceId }, { tabbySessionId: paymentId }] });
      if (order && order.orderStatus !== "Cancelled") {
        order.paymentStatus = status === "rejected" ? "failed" : "closed";
        order.orderStatus = "Cancelled";
        await order.save();
        console.log(`❌ Order ${referenceId} marked as ${status} via Webhook`);
      }
    }
  } catch (error) {
    console.error("❌ Tabby Webhook Error:", error.message);
  }
};

module.exports = {
  preScoring,
  createSession,
  createTabbyOrder,
  handleWebhook,
};
