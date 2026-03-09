// controllers/orderController.js
const Order = require("../models/OrderModel");
const ShippingAddress = require('../models/ShippingAddress')
const BillingAddress = require('../models/BillingAddress')
const Product = require("../models/product");
const userModel = require("../models/UserModel");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const stripePkg = require("stripe");
const axios = require("axios");
const sendEmail = require("../utils/sendEmail");

const stripe = process.env.STRIPE_SECRET_KEY
  ? stripePkg(process.env.STRIPE_SECRET_KEY)
  : null;

// Helper to validate address
const validateAddress = (addr) => {
  if (!addr) return false;
  return (
    addr.firstName &&
    addr.lastName &&
    addr.phone &&
    addr.address1 &&
    addr.city &&
    addr.country
  );
};

const createStripeOrder = async (req, res) => {
  try {
    const { userId } = req.user; // from JWT auth middleware
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      items,
      shippingAddress,
      billingAddress,
      paymentMethod = "stripe",
      calculateOnly = false,
    } = req.body;

    // ------------------------------
    // 1️⃣ VALIDATION
    // ------------------------------
    if (!items?.length) return res.status(400).json({ message: "Cart items are required" });
    if (!shippingAddress?.address1 || !shippingAddress?.city)
      return res.status(400).json({ message: "Valid shipping address is required" });

    // ------------------------------
    // 2️⃣ NORMALIZE BILLING ADDRESS
    // ------------------------------
    const finalBillingAddress =
      billingAddress?.address1 && billingAddress?.city ? billingAddress : shippingAddress;

    if (!finalBillingAddress?.address1 || !finalBillingAddress?.city) {
      return res.status(400).json({ message: "Valid billing address is required" });
    }

    // ------------------------------
    // 3️⃣ POPULATE PRODUCTS
    // ------------------------------
    const populatedItems = await Promise.all(
      items.map(async (it) => {
        const product = await Product.findById(it.productId)
          .select("name images salePrice")
          .lean();
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

    // ------------------------------
    // 4️⃣ CALCULATE TOTALS
    // ------------------------------
    const subtotal = populatedItems.reduce(
      (acc, item) => acc + (item.price || 0) * (item.quantity || 0),
      0
    );

    const { shippingFee, region } = calculateShippingFee({
      country: shippingAddress.country,
      subtotal,
    });

    const total = subtotal + shippingFee;

    // ------------------------------
    // 5️⃣ CALCULATE ONLY (OPTIONAL)
    // ------------------------------
    if (calculateOnly) {
      return res.status(200).json({
        success: true,
        subtotal,
        shippingFee,
        total,
        vatAmount: 0,
        region,
        items: populatedItems,
      });
    }

    // ------------------------------
    // 6️⃣ GENERATE REFERENCE ID (No DB Creation Yet)
    // ------------------------------
    const referenceId = `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // ------------------------------
    // 7️⃣ CREATE STRIPE CHECKOUT SESSION
    // ------------------------------
    if (paymentMethod === "stripe" && stripe) {
      const lineItems = populatedItems.map((item) => ({
        price_data: {
          currency: "aed",
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : [],
            metadata: {
              productId: item.productId.toString()
            }
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity || 1,
      }));

      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        customer_email: finalBillingAddress.email,
        shipping_address_collection: {
          allowed_countries: ["AE", "SA", "QA", "KW", "BH", "OM"],
        },
        success_url: `${clientUrl}/paymentsuccess?session_id={CHECKOUT_SESSION_ID}&orderId=${referenceId}`,
        cancel_url: `${clientUrl}/paymentcancel?orderId=${referenceId}`,
        metadata: {
          orderId: referenceId, // Using referenceId as orderId in metadata
          userId: userId.toString(),
          shippingInfo: JSON.stringify({
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            phone: shippingAddress.phone,
            address1: shippingAddress.address1,
            city: shippingAddress.city,
            country: shippingAddress.country
          })
        },
      });

      return res.status(201).json({
        success: true,
        referenceId,
        checkoutUrl: session.url,
      });
    }

    return res.status(400).json({ success: false, message: "Stripe integration error" });
  } catch (error) {
    console.error("Stripe Create Order Error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};









// (createTabbyOrder removed, handled in tabbyController.js)





const TAMARA_SECRET_KEY = process.env.TAMARA_SECRET_KEY;
const TAMARA_API_BASE = process.env.TAMARA_API_BASE;
const TAMARA_API_URL = `${TAMARA_API_BASE}/checkout`;

// Helper to validate address



// ==================================================
// CREATE TAMARA ORDER
// ==================================================
const createTamaraOrder = async (req, res) => {
  try {
    const { userId } = req.user; // from JWT auth middleware
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { items = [], shippingAddress, billingAddress, instalments = 3 } = req.body || {};

    // Validate items
    if (!items.length) return res.status(400).json({ message: "Items are required" });

    // Validate shipping address
    if (!validateAddress(shippingAddress)) {
      return res.status(400).json({ message: "Valid shipping address is required" });
    }

    // Determine billing address
    const finalBillingAddress = validateAddress(billingAddress) ? billingAddress : shippingAddress;

    // Populate items from DB
    const populatedItems = await Promise.all(
      items.map(async (it) => {
        const product = await Product.findById(it.productId).select("name images salePrice").lean();
        if (!product) throw new Error(`Product not found: ${it.productId}`);
        return {
          productId: product._id,
          name: product.name,
          image: product.images?.[0]?.url || "",
          price: product.salePrice,
          quantity: it.quantity || 1,
        };
      })
    );

    // Calculate totals
    const subtotal = populatedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const { shippingFee, region } = calculateShippingFee({
      country: shippingAddress.country || "AE",
      subtotal,
    });
    const total = subtotal + shippingFee;

    // Create order
    const order = await Order.create({
      userId,
      items: populatedItems,
      subtotal,
      shippingFee,
      total,
      vat: 0,
      region,
      currency: "AED",
      shippingAddress,
      billingAddress: finalBillingAddress,
      paymentMethod: "tamara",
      paymentStatus: "pending",
    });

    // Format items for Tamara
    const tamaraItems = populatedItems.map((item) => ({
      name: item.name,
      type: "Physical",
      reference_id: item.productId.toString(),
      sku: item.productId.toString(),
      quantity: item.quantity,
      unit_price: { amount: item.price, currency: "AED" },
      total_amount: { amount: item.price * item.quantity, currency: "AED" },
    }));

    // Tamara payload
    const tamaraPayload = {
      order_reference_id: order._id.toString(),
      order_number: order._id.toString(),
      total_amount: { amount: total, currency: "AED" },
      shipping_amount: { amount: shippingFee, currency: "AED" },
      tax_amount: { amount: 0, currency: "AED" },
      items: tamaraItems,
      consumer: {
        first_name: shippingAddress.firstName,
        last_name: shippingAddress.lastName,
        email: shippingAddress.email || "",
        phone_number: shippingAddress.phone,
      },
      billing_address: {
        first_name: finalBillingAddress.firstName,
        last_name: finalBillingAddress.lastName,
        line1: finalBillingAddress.address1,
        line2: finalBillingAddress.address2 || "",
        city: finalBillingAddress.city,
        country_code: finalBillingAddress.country || "AE",
        phone_number: finalBillingAddress.phone,
      },
      shipping_address: {
        first_name: shippingAddress.firstName,
        last_name: shippingAddress.lastName,
        line1: shippingAddress.address1,
        line2: shippingAddress.address2 || "",
        city: shippingAddress.city,
        country_code: shippingAddress.country || "AE",
        phone_number: shippingAddress.phone,
      },
      payment_type: "PAY_BY_INSTALMENTS",
      instalments,
      country_code: "AE",
      locale: "en_US",
      is_mobile: false,
      platform: "Montres Ecommerce",
      merchant_url: {
        success: `${process.env.TAMARA_MERCHANT_URL_BASE}/paymentsuccess?orderId=${order._id}`,
        cancel: `${process.env.TAMARA_MERCHANT_URL_BASE}/paymentcancel?orderId=${order._id}`,
        failure: `${process.env.TAMARA_MERCHANT_URL_BASE}/paymentfailure?orderId=${order._id}`,
        notification: `${process.env.TAMARA_MERCHANT_URL_BASE}/webhook/tamara`,
      },
    };

    // Call Tamara API
    const tamaraResponse = await axios.post(TAMARA_API_URL, tamaraPayload, {
      headers: {
        Authorization: `Bearer ${TAMARA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const checkoutUrl = tamaraResponse.data?._links?.checkout?.href || tamaraResponse.data?.checkout_url;
    if (!checkoutUrl) throw new Error("Tamara checkout URL not returned");

    order.tamaraSessionId = tamaraResponse.data.order_id;
    await order.save();

    // Send email notifications
    const productListHTML = populatedItems
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.name}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td>
            <td style="padding:8px;border:1px solid #ddd;">AED ${item.price}</td>
          </tr>`
      )
      .join("");

    const emailHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color:#d4af37;">🛍️ New Order Received</h2>
        <p><strong>Customer ID:</strong> ${userId}</p>
        <p><strong>Region:</strong> ${region}</p>
        <p><strong>Payment Method:</strong> Tamara</p>
        <p><strong>Total:</strong> AED ${total}</p>
        <h3>Products:</h3>
        <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;">Product</th>
              <th style="padding:8px;border:1px solid #ddd;">Qty</th>
              <th style="padding:8px;border:1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>${productListHTML}</tbody>
        </table>
        <p><strong>Shipping Country:</strong> ${shippingAddress.country}</p>
        <p style="margin-top:20px;">🕒 <em>Order placed on ${new Date().toLocaleString()}</em></p>
      </div>
    `;

    await sendEmail(process.env.ADMIN_EMAIL, "🛍️ New Order Notification", emailHTML);
    await sendEmail(process.env.SALES_EMAIL, "🛍️ New Order Notification", emailHTML);

    // Clear user cart
    await userModel.findByIdAndUpdate(userId, { $set: { cart: [] } });

    // Response
    return res.status(201).json({
      success: true,
      orderId: order._id,
      checkoutUrl,
    });
  } catch (error) {
    console.error("TAMARA ERROR:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Tamara payment initialization failed",
      error: error?.response?.data || error.message,
    });
  }
};



const getShippingAddresses = async (req, res) => {
  try {
    const userId = req.user.userId; // 👈 change here
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const addresses = await ShippingAddress.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: addresses.length,
      addresses
    });
  } catch (err) {
    console.error("Get Shipping Addresses Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};





// ---------------------
// Create Shipping Address
// ---------------------
const createShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body;



    // Deduplicate per user
    const existing = await ShippingAddress.findOne({
      userId,
      address1: data.address1,
      city: data.city,
      country: data.country,
      phone: data.phone
    });

    if (existing) {
      return res.json({ success: true, address: existing });
    }

    const address = await ShippingAddress.create({
      userId,
      ...data
    });

    return res.status(201).json({ success: true, address });
  } catch (err) {
    console.error("Create Shipping Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId; // 👈 change here
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    const deleted = await ShippingAddress.findOneAndDelete({
      _id: id,
      userId
    });

    if (!deleted) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Delete Shipping Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;   // shipping address id
    const updateData = req.body; // fields to update

    const updated = await ShippingAddress.findOneAndUpdate(
      { _id: id, userId },        // ensure address belongs to this user
      { $set: updateData },
      { new: true, runValidators: true } // return updated doc + validate
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Shipping address not found",
      });
    }

    return res.json({
      success: true,
      message: "Shipping address updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Update Shipping Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


const updateBillingAddress = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params; // billing address id
    const updateData = req.body; // fields to update

    const updated = await BillingAddress.findOneAndUpdate(
      { _id: id, userId },   // ensure it belongs to the user
      { $set: updateData },
      { new: true, runValidators: true } // return updated doc + validate schema
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Billing address not found",
      });
    }

    return res.json({
      success: true,
      message: "Billing address updated successfully",
      data: updated,
    });

  } catch (err) {
    console.error("Update Billing Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



const getBillingAddresses = async (req, res) => {
  try {
    const userId = req.user.userId; // 👈 change here
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const addresses = await BillingAddress.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: addresses.length,
      addresses
    });
  } catch (err) {
    console.error("Get Billing Addresses Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ---------------------
// Create Billing Address
// ---------------------
const createBillingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const data = req.body;

    if (!validateAddress(data)) {
      return res.status(400).json({ message: "Invalid billing address" });
    }

    // Deduplicate per user
    const existing = await BillingAddress.findOne({
      userId,
      address1: data.address1,
      city: data.city,
      country: data.country,
      phone: data.phone
    });

    if (existing) {
      return res.json({ success: true, address: existing });
    }

    const address = await BillingAddress.create({
      userId,
      ...data
    });

    return res.status(201).json({ success: true, address });
  } catch (err) {
    console.error("Create Billing Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


const deleteBillingAddress = async (req, res) => {
  try {
    const userId = req.user.userId; // 👈 change here
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    const deleted = await BillingAddress.findOneAndDelete({
      _id: id,
      userId
    });

    if (!deleted) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Delete Billing Address Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}
/**
 * Get order by ID
 */
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
          { tabbySessionId: id }
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

/**
 * List orders for logged-in user
 */
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json({ orders });
  } catch (error) {
    console.error("getAllOrders Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// get user My orders
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.userId; // ✅ Correct field
    console.log(userId, "userId");
    if (!userId) return res.status(400).json({ message: "User not provided" });
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    return res.json({ orders });
  } catch (error) {
    console.error("getMyOrders Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GENERATE PROFESSIONAL EMAIL HTML
 */
const generateProfessionalOrderEmail = ({ order, statusTitle, message }) => {
  const itemsHTML = (order.items || [])
    .map(
      (item) => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee;">
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 15px;">
            <p style="margin: 0; color: #1a1a1a; font-weight: 600; font-size: 14px;">${item.name}</p>
          </div>
        </div>
      </td>
      <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee; text-align: center; color: #666666;">${item.quantity}</td>
      <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee; text-align: right; font-weight: 600; color: #1a1a1a;">AED ${item.price}</td>
    </tr>
  `
    )
    .join("");

  const shipping = order.shippingAddress;
  const shippingString = `
    ${shipping.firstName} ${shipping.lastName}<br>
    ${shipping.address1}${shipping.address2 ? ", " + shipping.address2 : ""}<br>
    ${shipping.city}, ${shipping.state || ""}<br>
    ${shipping.country}
  `;

  return `
    <div style="background-color: #f8f8f8; padding: 40px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); padding: 30px; text-align: center;">
          <h1 style="color: #d4af37; margin: 0; font-size: 28px; letter-spacing: 2px; font-family: 'Georgia', serif;">MONTRES TRADING</h1>
          <p style="color: #ffffff; margin-top: 10px; font-size: 10px; opacity: 0.8; text-transform: uppercase; letter-spacing: 3px;">Excellence in Timepieces</p>
        </div>
        <div style="padding: 40px;">
          <h2 style="color: #1a1a1a; margin-top: 0; font-size: 22px; font-weight: 700;">${statusTitle}</h2>
          <p style="color: #666666; line-height: 1.6; font-size: 15px;">${message}</p>
          
          <div style="margin: 30px 0; border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0;">
            <div style="display: flex; justify-content: space-between;">
              <p style="margin: 0; font-size: 13px; color: #999999; text-transform: uppercase;">Order ID</p>
              <p style="margin: 0; font-size: 13px; color: #1a1a1a; font-weight: 600;">#${order._id}</p>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px;">
              <p style="margin: 0; font-size: 13px; color: #999999; text-transform: uppercase;">Date</p>
              <p style="margin: 0; font-size: 13px; color: #1a1a1a; font-weight: 600;">${new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; font-size: 12px; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1px;">Item</th>
                <th style="text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; font-size: 12px; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1px;">Qty</th>
                <th style="text-align: right; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; font-size: 12px; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>

          <div style="margin-top: 30px; text-align: right;">
            <p style="margin: 5px 0; color: #666666; font-size: 14px;">Subtotal: AED ${order.subtotal}</p>
            <p style="margin: 5px 0; color: #666666; font-size: 14px;">Shipping: AED ${order.shippingFee}</p>
            <h3 style="margin: 10px 0; color: #1a1a1a; font-size: 20px; font-weight: 700;">Total: AED ${order.total}</h3>
          </div>

          <div style="margin-top: 40px; padding: 25px; background-color: #fcfbf9; border-left: 4px solid #d4af37; border-radius: 4px;">
            <h4 style="margin: 0 0 10px 0; color: #d4af37; text-transform: uppercase; font-size: 11px; letter-spacing: 1.5px; font-weight: 700;">Shipping Destination</h4>
            <p style="margin: 0; color: #1a1a1a; font-size: 14px; line-height: 1.6;">
              ${shippingString}
            </p>
          </div>
          
          <div style="margin-top: 40px; text-align: center;">
            <p style="color: #666666; font-size: 14px;">If you have any questions, please contact us at <a href="mailto:support@montres.ae" style="color: #d4af37; text-decoration: none;">support@montres.ae</a></p>
          </div>
        </div>
        <div style="background-color: #1a1a1a; padding: 30px; text-align: center;">
          <p style="color: #ffffff; font-size: 11px; margin: 0; opacity: 0.5; letter-spacing: 1px; text-transform: uppercase;">&copy; 2026 Montres Trading LLC. Dubai, UAE.</p>
        </div>
      </div>
    </div>
  `;
};

module.exports = {
  getOrderById,
  getAllOrders,
  getMyOrders,
  getShippingAddresses,
  createShippingAddress,
  deleteShippingAddress,
  getBillingAddresses,
  createBillingAddress,
  deleteBillingAddress,
  createTamaraOrder,
  createStripeOrder,
  updateBillingAddress,
  updateShippingAddress
};
