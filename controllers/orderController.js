const Order = require("../models/OrderModel");
const ShippingAddress = require('../models/ShippingAddress')
const BillingAddress = require('../models/BillingAddress')
const Product = require("../models/product");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const { getTamaraOrderStatus, captureTamaraPayment, refundTamaraPayment } = require("./tamaraController");
const { refundTabbyPayment } = require("./tabbyController");
const sendOrderConfirmation = require("../utils/sendOrderConfirmation");
const sendPaymentRecoveryEmail = require("../utils/sendPaymentRecoveryEmail");
const { sendShipmentTrackingEmail } = require("../services/emailService");
const User = require("../models/UserModel");
const stripePkg = require("stripe");
const axios = require("axios");

const TABBY_BASE = process.env.TABBY_BASE_URL || "https://api.tabby.ai/api/v2";


const stripe = process.env.STRIPE_SECRET_KEY
  ? stripePkg(process.env.STRIPE_SECRET_KEY, {
    telemetry: false, // Disable background requests that can cause ECONNRESET crashes
  })
  : null;

const createStripeOrder = async (req, res) => {
  try {
    // ✅ optionalProtect: req.user may be null for offer checkout flow
    const userId = req.user?.userId || null;

    const { items, shippingAddress, billingAddress, paymentMethod = "stripe", calculateOnly = false, existingOrderId } = req.body;

    // For fresh orders (no existingOrderId), authentication is required
    if (!existingOrderId && !userId) {
      return res.status(401).json({ message: "Unauthorized. Please log in to place an order." });
    }

    if (!items?.length) return res.status(400).json({ message: "Cart items are required" });
    if (!shippingAddress?.address1 || !shippingAddress?.city) return res.status(400).json({ message: "Valid shipping address is required" });

    const finalBillingAddress = billingAddress?.address1 && billingAddress?.city ? billingAddress : shippingAddress;

    let order;
    let populatedItems = [];
    let subtotal = 0;
    let shippingFee = 0;
    let total = 0;
    let region = "";

    if (existingOrderId) {
      order = await Order.findById(existingOrderId);
      if (!order) return res.status(404).json({ message: "Existing order not found" });

      // Use items from existing order (important for fixed offer prices)
      populatedItems = order.items;
      subtotal = order.subtotal;

      // Re-calculate shipping if address country changed or if it was missing
      const calc = calculateShippingFee({ country: shippingAddress.country, subtotal });
      shippingFee = calc.shippingFee;
      region = calc.region;
      total = subtotal + shippingFee;

      if (!calculateOnly) {
        order.shippingAddress = shippingAddress;
        order.billingAddress = finalBillingAddress;
        order.shippingFee = shippingFee;
        order.total = total;
        order.region = region;
        order.paymentMethod = paymentMethod;
        await order.save();
      }
    } else {
      populatedItems = await Promise.all(
        items.map(async (it) => {
          const product = await Product.findById(it.productId).select("name images salePrice regularPrice sku").lean();
          if (!product) throw new Error(`Product not found: ${it.productId}`);
          return {
            productId: product._id,
            name: product.name,
            image: product.images?.[0]?.url || "",
            price: it.price || product.salePrice || product.regularPrice || 0,
            regularPrice: product.regularPrice, // Added to capture original price
            quantity: it.quantity || 1,
            sku: product.sku || "",
          };
        })
      );

      subtotal = populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const originalPriceTotal = populatedItems.reduce((acc, item) => acc + (item.regularPrice || item.price) * item.quantity, 0);

      const calc = calculateShippingFee({ country: shippingAddress.country, subtotal });
      shippingFee = calc.shippingFee;
      region = calc.region;
      total = subtotal + shippingFee;

      if (calculateOnly) {
        return res.status(200).json({ success: true, subtotal, originalPrice: originalPriceTotal, shippingFee, total, region, items: populatedItems });
      }

      order = await Order.create({
        userId,
        items: populatedItems,
        subtotal,
        originalPrice: originalPriceTotal,
        vat: 0,
        shippingFee,
        total,
        region,
        shippingAddress,
        billingAddress: finalBillingAddress,
        paymentMethod,
        paymentStatus: "pending",
        currency: "AED",
      });
    }

    if (calculateOnly) {
      return res.status(200).json({ success: true, subtotal, originalPrice: order.originalPrice, shippingFee, total, region, items: populatedItems });
    }

    if (paymentMethod === "stripe" && stripe) {
      const line_items = populatedItems.map(item => ({
        price_data: {
          currency: "aed",
          product_data: { name: item.name, images: item.image ? [item.image] : [] },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      // Add shipping fee as a line item if applicable
      if (shippingFee > 0) {
        line_items.push({
          price_data: {
            currency: "aed",
            product_data: { name: "Shipping Fee" },
            unit_amount: Math.round(shippingFee * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${process.env.CLIENT_URL || "https://www.montres.ae"}/checkout/verify?session_id={CHECKOUT_SESSION_ID}&orderId=${order._id}&payment=stripe`,
        cancel_url: `${process.env.CLIENT_URL || "https://www.montres.ae"}/checkout/cancel?orderId=${order._id}&payment=stripe`,
        metadata: { orderId: order._id.toString(), userId: userId ? userId.toString() : "" },
      });

      order.stripeSessionId = session.id;
      await order.save();
      return res.status(201).json({ success: true, order, checkoutUrl: session.url });
    }

    return res.status(201).json({ success: true, order });
  } catch (error) {
    console.error("Stripe Create Order Error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

const getShippingAddresses = async (req, res) => {
  try {
    const addresses = await ShippingAddress.find({ userId: req.user.userId }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, addresses });
  } catch (err) {
    console.error("Error in getShippingAddresses:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const createShippingAddress = async (req, res) => {
  try {
    const address = await ShippingAddress.create({ userId: req.user.userId, ...req.body });
    return res.status(201).json({ success: true, address });
  } catch (err) {
    console.error("Error in createShippingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const deleteShippingAddress = async (req, res) => {
  try {
    await ShippingAddress.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in deleteShippingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const updateShippingAddress = async (req, res) => {
  try {
    const updated = await ShippingAddress.findOneAndUpdate({ _id: req.params.id, userId: req.user.userId }, { $set: req.body }, { new: true });
    return res.json({ success: true, address: updated });
  } catch (err) {
    console.error("Error in updateShippingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getBillingAddresses = async (req, res) => {
  try {
    const addresses = await BillingAddress.find({ userId: req.user.userId }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, addresses });
  } catch (err) {
    console.error("Error in getBillingAddresses:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const createBillingAddress = async (req, res) => {
  try {
    const address = await BillingAddress.create({ userId: req.user.userId, ...req.body });
    return res.status(201).json({ success: true, address });
  } catch (err) {
    console.error("Error in createBillingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const deleteBillingAddress = async (req, res) => {
  try {
    await BillingAddress.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in deleteBillingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const updateBillingAddress = async (req, res) => {
  try {
    const updated = await BillingAddress.findOneAndUpdate({ _id: req.params.id, userId: req.user.userId }, { $set: req.body }, { new: true });
    return res.json({ success: true, address: updated });
  } catch (err) {
    console.error("Error in updateBillingAddress:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    let order;

    // First try by MongoDB _id if it's a valid ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(id).lean();
    }

    // If not found or not a valid ObjectId, try by the custom orderId field
    if (!order) {
      order = await Order.findOne({
        $or: [
          { orderId: id },
          { tabbySessionId: id },
          { stripeSessionId: id },
          { tamaraOrderId: id }
        ]
      }).lean();
    }

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ SECURITY CHECK: Allow lookup by custom reference orderId (e.g. tabby_..., tamara_..., checkout success pages),
    // or if the requester is the owner, admin, or if it's a guest order
    const isReferenceIdLookup = !!(order.orderId && order.orderId === id) ||
      !!(order.tabbySessionId && order.tabbySessionId === id) ||
      !!(order.stripeSessionId && order.stripeSessionId === id) ||
      !!(order.tamaraOrderId && order.tamaraOrderId === id);
    const isAdmin = req.admin || (req.user && req.user.isAdmin);
    const isGuestOrder = !order.userId;
    const isOwner = isGuestOrder || isReferenceIdLookup || (req.user && order.userId && order.userId.toString() === req.user.userId.toString());

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You are not authorized to view this order" });
    }

    // ==================================================
    // SELF-HEALING: If pending Tamara, check live status
    // ==================================================
    if (order.paymentMethod === "tamara" && (order.paymentStatus === "pending" || order.paymentStatus === "authorized") && order.tamaraOrderId) {
      console.log(`🔍 Self-healing: Checking live status for Tamara Order ${order.tamaraOrderId}`);
      const tamaraData = await getTamaraOrderStatus(order.tamaraOrderId);
      
      if (tamaraData) {
        const tamaraStatus = tamaraData.status?.toLowerCase();
        const isAuthorised = ["approved", "authorised", "fully_authorised", "authorized"].includes(tamaraStatus);
        
        if (isAuthorised) {
          console.log(`✅ Tamara order ${order.tamaraOrderId} is AUTHORISED. Syncing DB...`);
          
          // Atomic update to avoid race with late webhook
          const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, paymentStatus: "pending" },
            {
              $set: {
                paymentStatus: "paid",
                orderStatus: "Paid / Awaiting Shipment",
                paidAt: new Date()
              }
            },
            { new: true }
          ).lean();

          if (updatedOrder) {
            order = updatedOrder;
            // Background tasks
            if (order.userId) {
              await User.findByIdAndUpdate(order.userId, { 
                $set: { cart: [] },
                $addToSet: { orders: order._id } 
              }).catch(e => console.error("User sync error:", e.message));
            }
            sendOrderConfirmation(order._id).catch(e => console.error("Email error:", e.message));
            
            // Trigger capture
            captureTamaraPayment(order.tamaraOrderId, order.total, order.currency || "AED");
          }
        } else if (["failed", "canceled", "expired", "declined"].includes(tamaraStatus)) {
          console.log(`❌ Tamara order ${order.tamaraOrderId} is ${tamaraStatus}. Marking FAILED.`);
          await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: "failed", orderStatus: "Cancelled" } });
          order.paymentStatus = "failed";
          order.orderStatus = "Cancelled";
        }
      }
    }

    // ==================================================
    // SELF-HEALING: If pending Stripe, check live session
    // ==================================================
    else if (order.paymentMethod === "stripe" && order.paymentStatus === "pending" && order.stripeSessionId && stripe) {
      console.log(`🔍 Self-healing: Checking live Stripe session ${order.stripeSessionId}`);
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        const stripePaymentStatus = session?.payment_status;

        if (stripePaymentStatus === "paid") {
          console.log(`✅ Stripe session ${order.stripeSessionId} is PAID. Syncing DB...`);

          const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, paymentStatus: "pending" },
            {
              $set: {
                paymentStatus: "paid",
                orderStatus: "Paid / Awaiting Shipment",
                stripePaymentIntentId: session.payment_intent,
                paidAt: new Date()
              }
            },
            { new: true }
          ).lean();

          if (updatedOrder) {
            order = updatedOrder;
            if (order.userId) {
              User.findByIdAndUpdate(order.userId, {
                $set: { cart: [] },
                $addToSet: { orders: order._id }
              }).catch(e => console.error("User sync error:", e.message));
            }
            sendOrderConfirmation(order._id)
              .catch(e => console.error("Email error:", e.message));
          } else {
            const freshOrder = await Order.findById(order._id).lean();
            if (freshOrder) order = freshOrder;
          }

        } else if (session?.status === "expired" || session?.status === "canceled") {
          console.log(`❌ Stripe session ${order.stripeSessionId} is ${session.status}. Marking FAILED.`);
          await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: "failed", orderStatus: "Cancelled" } });
          order.paymentStatus = "failed";
          order.orderStatus = "Cancelled";
        }
      } catch (stripeErr) {
        console.error(`⚠️ Stripe self-healing lookup failed for session ${order.stripeSessionId}:`, stripeErr.message);
      }
    }

    // ==================================================
    // SELF-HEALING: If pending Tabby, check live payment
    // ==================================================
    else if (order.paymentMethod === "tabby" && order.paymentStatus === "pending" && order.tabbySessionId) {
      console.log(`🔍 Self-healing: Checking live Tabby payment ${order.tabbySessionId}`);
      try {
        let tabbyData = null;
        let paymentId = order.tabbySessionId;

        // Try /payments/{id} first
        try {
          const tabbyRes = await axios.get(
            `${TABBY_BASE}/payments/${order.tabbySessionId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
                "Content-Type": "application/json"
              },
              timeout: 8000
            }
          );
          tabbyData = tabbyRes.data;
        } catch (payErr) {
          // If 404, try /checkout/{id} in case tabbySessionId is a checkout session id
          if (payErr.response?.status === 404) {
            try {
              const chkRes = await axios.get(
                `${TABBY_BASE}/checkout/${order.tabbySessionId}`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
                    "Content-Type": "application/json"
                  },
                  timeout: 8000
                }
              );
              tabbyData = chkRes.data?.payment || chkRes.data;
              if (chkRes.data?.payment?.id) {
                paymentId = chkRes.data.payment.id;
              }
            } catch (chkErr) {
              console.warn(`⚠️ Tabby checkout lookup fallback failed: ${chkErr.message}`);
            }
          }
        }

        if (tabbyData) {
          const tabbyStatus = (tabbyData.status || "").toLowerCase();
          const isConfirmed = ["closed", "captured", "authorized"].includes(tabbyStatus);

          if (isConfirmed) {
            console.log(`✅ Tabby payment ${order.tabbySessionId} is ${tabbyStatus}. Syncing DB to PAID...`);

            let captureId = null;
            // If authorized, trigger capture
            if (tabbyStatus === "authorized" && paymentId) {
              try {
                const captureDecimals = ["KWD", "BHD", "OMR"].includes(order.currency?.toUpperCase()) ? 3 : 2;
                const capRes = await axios.post(
                  `${TABBY_BASE}/payments/${paymentId}/captures`,
                  { amount: String(Number(order.total || 0).toFixed(captureDecimals)) },
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
                      "Content-Type": "application/json"
                    },
                    timeout: 8000
                  }
                );
                captureId = capRes.data?.id;
                console.log(`✅ Tabby payment captured: ${captureId}`);
              } catch (capErr) {
                console.warn(`Self-healing capture note: ${capErr.message}`);
              }
            }

            // Atomic update to PAID
            const updatedOrder = await Order.findOneAndUpdate(
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
            ).lean();

            if (updatedOrder) {
              order = updatedOrder;
              // Background tasks — fire-and-forget
              if (order.userId) {
                User.findByIdAndUpdate(order.userId, {
                  $set: { cart: [] },
                  $addToSet: { orders: order._id }
                }).catch(e => console.error("User sync error:", e.message));
              }
              sendOrderConfirmation(order._id)
                .catch(e => console.error("Email error:", e.message));
            } else {
              // Webhook already processed this — re-read fresh state
              const freshOrder = await Order.findById(order._id).lean();
              if (freshOrder) order = freshOrder;
            }

          } else if (["failed", "expired", "rejected", "canceled", "cancelled"].includes(tabbyStatus)) {
            if (!tabbyData.payment || ["failed", "expired", "rejected", "canceled", "cancelled"].includes((tabbyData.payment?.status || "").toLowerCase())) {
              console.log(`❌ Tabby payment ${order.tabbySessionId} is ${tabbyStatus}. Marking FAILED.`);
              await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: "failed", orderStatus: "Cancelled" } });
              order.paymentStatus = "failed";
              order.orderStatus = "Cancelled";
            }
          }
        } else {
          // If no Tabby data (404) and the order was created more than 2 hours ago, it's expired/abandoned
          const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
          if (orderAgeMs > 2 * 60 * 60 * 1000) {
            console.log(`❌ Tabby session ${order.tabbySessionId} expired / not found after 2 hours. Marking FAILED.`);
            await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: "failed", orderStatus: "Cancelled" } });
            order.paymentStatus = "failed";
            order.orderStatus = "Cancelled";
          }
        }
      } catch (tabbyErr) {
        // Never crash the order lookup if Tabby API is temporarily unavailable
        console.error(`⚠️ Tabby self-healing lookup failed for payment ${order.tabbySessionId}:`, tabbyErr.message);
      }
    }

    return res.json({ order });
  } catch (error) {
    console.error("Get Order Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const rawOrders = await Order.find().sort({ createdAt: -1 }).lean();

    const orders = rawOrders.map((order) => {
      let failureReason = order.failureReason || "";
      let paymentFailureType = order.paymentFailureType || "none";
      const isUnsuccessful =
        ["pending", "failed", "cancelled", "Cancelled"].includes(order.paymentStatus) ||
        ["Cancelled", "Pending", "failed"].includes(order.orderStatus);

      if (!failureReason && isUnsuccessful && order.paymentStatus !== "paid") {
        if (order.paymentMethod === "tamara") {
          failureReason = "Customer abandoned Tamara checkout (Session Expired / OTP not entered)";
          paymentFailureType = "customer_abandoned";
        } else if (order.paymentMethod === "tabby") {
          failureReason = "Customer abandoned Tabby checkout (Session Expired / Window Closed)";
          paymentFailureType = "customer_abandoned";
        } else if (order.paymentMethod === "stripe") {
          failureReason = "Customer abandoned Stripe Checkout (Session Expired without entering card)";
          paymentFailureType = "customer_abandoned";
        }
      }

      const customerEmail = order.shippingAddress?.email || order.billingAddress?.email || "";

      return {
        ...order,
        failureReason,
        paymentFailureType,
        canSendRecoveryEmail: isUnsuccessful && !!customerEmail && order.paymentStatus !== "paid",
      };
    });

    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
};

const calculateShipping = async (req, res) => {
  try {
    const { items, country, subtotal: passedSubtotal } = req.body;

    if (!country) {
      return res.status(400).json({ success: false, message: "Country is required" });
    }

    let subtotal = passedSubtotal;

    // If subtotal not provided, calculate it from items
    if (subtotal === undefined || subtotal === null) {
      if (!items || !items.length) {
        return res.status(400).json({ success: false, message: "Items or subtotal required" });
      }

      const populatedItems = await Promise.all(
        items.map(async (it) => {
          const product = await Product.findById(it.productId).select("salePrice regularPrice").lean();
          if (!product) throw new Error(`Product not found: ${it.productId}`);
          const price = product.salePrice || product.regularPrice || 0;
          return { price, quantity: it.quantity || 1 };
        })
      );
      subtotal = populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }

    const { shippingFee, region, threshold } = calculateShippingFee({ country, subtotal });

    return res.json({
      success: true,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      region,
      threshold
    });
  } catch (error) {
    console.error("Calculate Shipping Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndDelete(id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    console.error("Delete Order Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const refundOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount: manualAmount } = req.body; // Optional partial refund amount

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.paymentStatus !== "paid" && order.paymentStatus !== "authorized") {
      return res.status(400).json({ message: `Cannot refund order with status: ${order.paymentStatus}` });
    }

    const refundAmount = manualAmount || order.total;
    let refundSuccess = false;

    // 1. Stripe Refund
    if (order.paymentMethod === "stripe" && stripe) {
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ message: "Stripe Payment Intent ID missing" });
      }
      try {
        await stripe.refunds.create({
          payment_intent: order.stripePaymentIntentId,
          amount: Math.round(refundAmount * 100),
        });
        refundSuccess = true;
      } catch (err) {
        console.error("Stripe Refund Error:", err.message);
        return res.status(500).json({ message: `Stripe Refund Failed: ${err.message}` });
      }
    }

    // 2. Tamara Refund
    else if (order.paymentMethod === "tamara") {
      if (!order.tamaraOrderId) {
        return res.status(400).json({ message: "Tamara Order ID missing" });
      }
      refundSuccess = await refundTamaraPayment(order.tamaraOrderId, refundAmount, order.currency || "AED");
    }

    // 3. Tabby Refund
    else if (order.paymentMethod === "tabby") {
      if (!order.tabbySessionId) {
        return res.status(400).json({ message: "Tabby Session ID missing" });
      }
      refundSuccess = await refundTabbyPayment(order.tabbySessionId, refundAmount, order.currency || "AED");
    }

    if (refundSuccess) {
      order.paymentStatus = "refunded";
      order.orderStatus = "Cancelled";
      await order.save();
      return res.json({ success: true, message: "Order refunded successfully", order });
    } else {
      return res.status(500).json({ message: "Refund processing failed at the gateway" });
    }

  } catch (error) {
    console.error("Refund Order Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * 🚚 Update Order Logistics (Status, Tracking Number, Delivery Date, Courier)
 * Supports automated email notification trigger to customer
 */
const updateOrderLogistics = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      orderStatus,
      trackingNumber,
      courierName,
      trackingUrl,
      estimatedDeliveryDate,
      deliveryNotes,
      sendEmailNotification = false,
      customNote = "",
      shippedAt,
      delivered_at,
      deliveredAt
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (orderStatus !== undefined) {
      order.orderStatus = orderStatus;
      if ((orderStatus === "Shipped" || orderStatus === "shipped" || orderStatus === "In Transit") && !order.shippedAt) {
        order.shippedAt = shippedAt || new Date();
      }
      if ((orderStatus === "Delivered" || orderStatus === "delivered" || orderStatus === "Completed") && !order.delivered_at) {
        order.delivered_at = delivered_at || deliveredAt || new Date();
      }
    }

    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    if (courierName !== undefined) order.courierName = courierName;
    if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
    if (estimatedDeliveryDate !== undefined) order.estimatedDeliveryDate = estimatedDeliveryDate;
    if (deliveryNotes !== undefined) order.deliveryNotes = deliveryNotes;
    if (shippedAt !== undefined) order.shippedAt = shippedAt;
    if (delivered_at !== undefined || deliveredAt !== undefined) {
      order.delivered_at = delivered_at || deliveredAt;
    }

    let emailResult = null;
    // Send email notification if requested
    if (sendEmailNotification) {
      try {
        emailResult = await sendShipmentTrackingEmail(order, {
          trackingNumber: order.trackingNumber,
          courierName: order.courierName,
          trackingUrl: order.trackingUrl,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          customNote,
          status: order.orderStatus,
        });
        order.emailNotificationSent = true;
        order.lastNotificationSentAt = new Date();
      } catch (emailErr) {
        console.error("⚠️ Failed to send shipment tracking email:", emailErr.message);
      }
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order logistics updated successfully",
      order,
      emailSent: !!emailResult?.success
    });
  } catch (error) {
    console.error("Update Order Logistics Error:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * 📧 Send / Resend Tracking Notification Email on Demand
 */
const sendOrderTrackingEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      trackingNumber,
      courierName,
      trackingUrl,
      estimatedDeliveryDate,
      customNote = "",
      status
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Update fields if provided in email payload
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (courierName) order.courierName = courierName;
    if (trackingUrl) order.trackingUrl = trackingUrl;
    if (estimatedDeliveryDate) order.estimatedDeliveryDate = estimatedDeliveryDate;

    const emailResult = await sendShipmentTrackingEmail(order, {
      trackingNumber: order.trackingNumber,
      courierName: order.courierName,
      trackingUrl: order.trackingUrl,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      customNote,
      status: status || order.orderStatus,
    });

    order.emailNotificationSent = true;
    order.lastNotificationSentAt = new Date();
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Shipment tracking notification email sent successfully",
      emailResult,
      order
    });
  } catch (error) {
    console.error("Send Order Tracking Email Error:", error);
    return res.status(500).json({ success: false, message: "Failed to send tracking email", error: error.message });
  }
};

/**
 * 🔄 Periodic Stripe Auto-Reconciliation
 */
const syncStripeOrders = async () => {
  if (!stripe) return { processed: 0, updated: 0 };
  try {
    const pendingOrders = await Order.find({ paymentMethod: "stripe", paymentStatus: "pending" });
    let updated = 0;

    for (const order of pendingOrders) {
      if (!order.stripeSessionId) continue;
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.payment_status === "paid") {
          const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, paymentStatus: "pending" },
            {
              $set: {
                paymentStatus: "paid",
                orderStatus: "Paid / Awaiting Shipment",
                stripePaymentIntentId: session.payment_intent,
                paidAt: new Date()
              }
            },
            { new: true }
          );

          if (updatedOrder) {
            updated++;
            if (updatedOrder.userId) {
              User.findByIdAndUpdate(updatedOrder.userId, {
                $set: { cart: [] },
                $addToSet: { orders: updatedOrder._id }
              }).catch(e => console.error("User sync error:", e.message));
            }
            sendOrderConfirmation(updatedOrder._id)
              .catch(e => console.error("Email error:", e.message));
          }
        } else if (session.status === "expired" || session.status === "canceled") {
          await Order.findByIdAndUpdate(order._id, {
            $set: { paymentStatus: "failed", orderStatus: "Cancelled" }
          });
          updated++;
        }
      } catch (err) {
        console.error(`Stripe sync error for order ${order._id}:`, err.message);
      }
    }

    return { processed: pendingOrders.length, updated };
  } catch (err) {
    console.error("Stripe sync failed:", err.message);
    return { error: err.message };
  }
};

/**
 * 📧 Super Admin: Send Payment Recovery / Retry Email
 */
const sendPaymentRecoveryEmailController = async (req, res) => {
  try {
    const { id } = req.params;
    const { customMessage, retryUrl } = req.body || {};

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const email = order.shippingAddress?.email || order.billingAddress?.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "No customer email address on this order" });
    }

    const result = await sendPaymentRecoveryEmail(id, { customMessage, retryUrl });

    return res.status(200).json({
      success: true,
      message: `Payment recovery email sent successfully to ${email}`,
      order: result.order,
      recoveryEmailCount: result.order.recoveryEmailCount,
      lastRecoveryEmailSentAt: result.order.lastRecoveryEmailSentAt
    });
  } catch (error) {
    console.error("Send Payment Recovery Email Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send payment recovery email",
      error: error.message
    });
  }
};

module.exports = {
  createStripeOrder,
  getOrderById,
  getAllOrders,
  getMyOrders,
  getShippingAddresses,
  createShippingAddress,
  deleteShippingAddress,
  getBillingAddresses,
  createBillingAddress,
  deleteBillingAddress,
  updateBillingAddress,
  updateShippingAddress,
  calculateShipping,
  deleteOrder,
  refundOrder,
  updateOrderLogistics,
  sendOrderTrackingEmail,
  sendPaymentRecoveryEmailController,
  syncStripeOrders,
};


