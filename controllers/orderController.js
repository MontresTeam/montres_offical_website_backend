const Order = require("../models/OrderModel");
const ShippingAddress = require('../models/ShippingAddress')
const BillingAddress = require('../models/BillingAddress')
const Product = require("../models/product");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const stripePkg = require("stripe");


const stripe = process.env.STRIPE_SECRET_KEY
  ? stripePkg(process.env.STRIPE_SECRET_KEY)
  : null;

const createStripeOrder = async (req, res) => {
  try {
    const { userId } = req.user;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { items, shippingAddress, billingAddress, paymentMethod = "stripe", calculateOnly = false } = req.body;

    if (!items?.length) return res.status(400).json({ message: "Cart items are required" });
    if (!shippingAddress?.address1 || !shippingAddress?.city) return res.status(400).json({ message: "Valid shipping address is required" });

    const finalBillingAddress = billingAddress?.address1 && billingAddress?.city ? billingAddress : shippingAddress;

    const populatedItems = await Promise.all(
      items.map(async (it) => {
        const product = await Product.findById(it.productId).select("name images salePrice").lean();
        if (!product) throw new Error(`Product not found: ${it.productId}`);
        return {
          productId: product._id,
          name: product.name,
          image: product.images?.[0]?.url || "",
          price: product.salePrice || 0,
          quantity: it.quantity || 1,
        };
      })
    );

    const subtotal = populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const { shippingFee, region } = calculateShippingFee({ country: shippingAddress.country, subtotal });
    const total = subtotal + shippingFee;

    if (calculateOnly) {
      return res.status(200).json({ success: true, subtotal, shippingFee, total, region, items: populatedItems });
    }

    const order = await Order.create({
      userId,
      items: populatedItems,
      subtotal,
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

    if (paymentMethod === "stripe" && stripe) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: populatedItems.map(item => ({
          price_data: {
            currency: "aed",
            product_data: { name: item.name, images: item.image ? [item.image] : [] },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: item.quantity,
        })),
        mode: "payment",
        success_url: `${process.env.CLIENT_URL || "https://www.montres.ae"}/checkout/verify?session_id={CHECKOUT_SESSION_ID}&orderId=${order._id}&payment=stripe`,
        cancel_url: `${process.env.CLIENT_URL || "https://www.montres.ae"}/checkout/cancel?orderId=${order._id}&payment=stripe`,
        metadata: { orderId: order._id.toString(), userId: userId.toString() },
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

    return res.json({ order });
  } catch (error) {
    console.error("Get Order Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
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
};
