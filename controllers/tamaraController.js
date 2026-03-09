const Order = require("../models/OrderModel");
const Product = require("../models/product");
const User = require("../models/UserModel");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const sendOrderConfirmation = require("../utils/sendOrderConfirmation");
const axios = require("axios");
const crypto = require("crypto");

const TAMARA_SECRET_KEY = process.env.TAMARA_SECRET_KEY;
const TAMARA_API_BASE = process.env.TAMARA_API_BASE;
const TAMARA_API_URL = `${TAMARA_API_BASE}/checkout`;

// ==================================================
// COUNTRY CODE NORMALIZATION HELPER
// ==================================================
// ==================================================
// COUNTRY CODE NORMALIZATION HELPER
// ==================================================
const normalizeCountryCode = (value) => {
    if (!value) return "AE";
    const v = value.toUpperCase().trim();
    if (v === "UAE" || v === "UNITED ARAB EMIRATES" || v === "DUBAI") return "AE";
    if (v === "KSA" || v === "SAUDI ARABIA" || v === "SAUDI") return "SA";
    if (v === "OMAN") return "OM";
    if (v === "KUWAIT") return "KW";
    if (v === "BAHRAIN") return "BH";
    if (v === "QATAR") return "QA";
    return v.length === 2 ? v : "AE";
};

// ==================================================
// CREATE TAMARA ORDER (FIXED - AED DIRECT)
// ==================================================
const createTamaraOrder = async (req, res) => {
    try {
        const userId = req.user.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const {
            items = [],
            shippingAddress,
            billingAddress,
            instalments = 3,
        } = req.body || {};

        // ===============================
        // VALIDATION
        // ===============================

        if (!shippingAddress?.phone?.startsWith("+971")) {
            return res.status(400).json({
                success: false,
                message: "Tamara UAE requires phone starting with +971",
            });
        }

        const countryCode = "AE";
        const ALLOWED_INSTALLMENTS = [3, 4, 6];

        if (!ALLOWED_INSTALLMENTS.includes(Number(instalments))) {
            return res.status(400).json({
                success: false,
                message: "Allowed instalments: 3, 4, 6",
            });
        }

        const finalBillingAddress =
            billingAddress?.address1 && billingAddress?.city
                ? billingAddress
                : shippingAddress;

        // ===============================
        // FETCH PRODUCTS
        // ===============================

        const populatedItems = await Promise.all(
            items.map(async (it) => {
                const product = await Product.findById(it.productId)
                    .select("name images salePrice regularPrice stockQuantity published sku")
                    .lean();

                if (!product) throw new Error("Product not found");
                if (!product.published) throw new Error("Product unavailable");

                const price = product.salePrice || product.regularPrice || 0;

                return {
                    productId: product._id,
                    name: product.name,
                    image: product.images?.[0]?.url || "",
                    price: Number(price),
                    quantity: Number(it.quantity) || 1,
                    sku: product.sku || product._id.toString(),
                };
            })
        );

        // ===============================
        // CALCULATIONS (NO FX CONVERSION)
        // ===============================

        const subtotal = populatedItems.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0
        );

        const { shippingFee } = calculateShippingFee({
            country: shippingAddress?.country || "AE", // Tamara UAE only supports AED, so country is fixed to AE
            subtotal
        });
        const total = subtotal + shippingFee;

        // ===============================
        // TAMARA ITEMS
        // ===============================

        const tamaraItems = populatedItems.map((item) => ({
            name: item.name,
            type: "Physical",
            reference_id: item.productId.toString(),
            sku: item.productId.toString(),
            quantity: item.quantity,
            unit_price: {
                amount: Number(item.price.toFixed(2)),
                currency: "AED",
            },
            total_amount: {
                amount: Number((item.price * item.quantity).toFixed(2)),
                currency: "AED",
            },
        }));

        const tamaraTotal = Number(total.toFixed(2));

        // ===============================
        // CREATE ORDER IN DB
        // ===============================

        const order = await Order.create({
            userId,
            items: populatedItems,
            subtotal,
            shippingFee,
            total,
            vat: 0,
            currency: "AED",
            settlementCurrency: "AED",
            fxRate: 1,
            shippingAddress,
            billingAddress: finalBillingAddress,
            paymentMethod: "tamara",
            paymentStatus: "pending",
        });

        const baseUrl =
            process.env.CLIENT_URL ||
            "http://localhost:3000";

        const backendUrl =
            process.env.BACKEND_URL ||
            "https://api.montres.ae";

        const orderId = order._id.toString();

        const tamaraPayload = {
            order_reference_id: orderId,
            order_number: orderId,
            description: `Order ${orderId} - Montres`,
            total_amount: {
                amount: tamaraTotal,
                currency: "AED",
            },
            shipping_amount: {
                amount: Number(shippingFee.toFixed(2)),
                currency: "AED",
            },
            tax_amount: {
                amount: 0,
                currency: "AED",
            },
            items: tamaraItems,
            consumer: {
                first_name: shippingAddress.firstName,
                last_name: shippingAddress.lastName,
                email: shippingAddress.email || req.user.email,
                phone_number: shippingAddress.phone,
            },
            billing_address: {
                first_name: finalBillingAddress.firstName,
                last_name: finalBillingAddress.lastName,
                line1: finalBillingAddress.address1,
                line2: finalBillingAddress.address2 || "",
                city: finalBillingAddress.city,
                region: finalBillingAddress.region || finalBillingAddress.city,
                country_code: countryCode,
                phone_number: finalBillingAddress.phone,
            },
            shipping_address: {
                first_name: shippingAddress.firstName,
                last_name: shippingAddress.lastName,
                line1: shippingAddress.address1,
                line2: shippingAddress.address2 || "",
                city: shippingAddress.city,
                region: shippingAddress.region || shippingAddress.city,
                country_code: countryCode,
                phone_number: shippingAddress.phone,
            },
            payment_type: "PAY_BY_INSTALMENTS",
            instalments: Number(instalments),
            country_code: countryCode,
            locale: "en_AE",
            merchant_url: {
                success: `${baseUrl}/checkout/verify?orderId=${orderId}&payment=tamara`,
                cancel: `${baseUrl}/checkout/cancel?orderId=${orderId}&payment=tamara`,
                failure: `${baseUrl}/checkout/failure?orderId=${orderId}&payment=tamara`,
                notification: `${backendUrl}/api/webhook/tamara`,
            },
        };

        console.log("Tamara Payload:", tamaraPayload);

        const tamaraResponse = await axios.post(
            `${process.env.TAMARA_API_BASE}/checkout`,
            tamaraPayload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const checkoutUrl =
            tamaraResponse.data?._links?.checkout?.href ||
            tamaraResponse.data?.checkout_url;

        if (!checkoutUrl) {
            throw new Error("Tamara checkout URL not returned");
        }

        order.tamaraOrderId = tamaraResponse.data.order_id;
        await order.save();

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

// ==================================================
// VERIFY TAMARA SIGNATURE
// ==================================================
const verifyTamaraSignature = (req) => {
    // Sandbox / Development skip
    if (process.env.NODE_ENV !== "production") {
        console.log("⚠️ Tamara sandbox mode – skipping signature verification");
        return true;
    }

    const signature =
        req.headers["x-tamara-signature"] ||
        req.headers["x-tamara-notification-signature"];

    const webhookSecret = process.env.TAMARA_WEBHOOK_SECRET;

    if (!signature) {
        console.error("❌ Tamara signature header missing");
        return false;
    }

    if (!webhookSecret) {
        console.error("❌ TAMARA_WEBHOOK_SECRET missing in .env");
        return false;
    }

    try {
        const payload = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(payload)
            .digest("hex");

        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (signatureBuffer.length !== expectedBuffer.length) return false;
        return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (err) {
        console.error("❌ Tamara signature verification error:", err.message);
        return false;
    }
};

// ==================================================
// CAPTURE TAMARA PAYMENT
// ==================================================
const captureTamaraPayment = async (orderId, totalAmount, currency = "AED") => {
    try {
        console.log(`🚀 Capturing Tamara Payment: ${orderId} (${totalAmount} ${currency})`);
        const capturePayload = {
            order_id: orderId,
            total_amount: { amount: totalAmount, currency: currency },
            shipping_info: {
                shipping_company: "Shipping",
                tracking_number: "N/A",
                tracking_url: "N/A"
            }
        };

        await axios.post(`${process.env.TAMARA_API_BASE}/payments/capture`, capturePayload, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        return true;
    } catch (err) {
        console.error("❌ Tamara Capture Error:", err.response?.data || err.message);
        return false;
    }
};

// ==================================================
// HANDLE TAMARA WEBHOOK
// ==================================================
const handleTamaraWebhook = async (req, res) => {
    try {
        // 1. Verify Signature
        if (!verifyTamaraSignature(req)) {
            return res.status(401).json({ message: "Invalid signature" });
        }

        // 2. Parse Payload
        let payload = req.body;
        if (Buffer.isBuffer(req.body)) {
            payload = JSON.parse(req.body.toString("utf-8"));
        }

        console.log("🔔 Tamara Webhook Received:", JSON.stringify(payload, null, 2));

        const orderReferenceId = payload.order_reference_id || payload.order_number;
        const tamaraOrderId = payload.order_id;
        const eventType = (payload.event_type || payload.order_status || "").toLowerCase();

        if (!orderReferenceId) {
            return res.status(200).send("No reference ID");
        }

        // 3. Find Order (Search by _id or orderId field)
        let order = await Order.findById(orderReferenceId);
        if (!order) {
            order = await Order.findOne({ orderId: orderReferenceId });
        }

        if (!order) {
            console.error(`❌ Order not found: ${orderReferenceId}`);
            return res.status(200).send("Order not found");
        }

        // 4. Handle Success Events (Approved / Authorised)
        const isSuccessEvent = ["approved", "order_authorized", "order_authorised", "authorised"].includes(eventType);

        if (isSuccessEvent) {
            // Idempotent update: only if not already marked paid
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: order._id, paymentStatus: { $ne: "paid" } },
                {
                    $set: {
                        paymentStatus: "paid",
                        orderStatus: "Processing",
                        tamaraOrderId: tamaraOrderId,
                        paidAt: new Date()
                    }
                },
                { new: true }
            );

            const activeOrder = updatedOrder || order;

            // Run these actions if it's the first time processing success
            if (updatedOrder) {
                if (activeOrder.userId) {
                    await User.findByIdAndUpdate(activeOrder.userId, {
                        $set: { cart: [] },
                        $addToSet: { orders: activeOrder._id }
                    });
                    console.log(`🛒 Cart cleared for User: ${activeOrder.userId}`);
                }
                await sendOrderConfirmation(activeOrder._id).catch(e => console.error("📧 Email Error:", e.message));
            }

            // TRIGGER CAPTURE ONLY ON AUTHORISED
            // This prevents "transition_not_allowed" from 'approved' status
            const isAuthorised = ["order_authorized", "order_authorised", "authorised"].includes(eventType);
            if (isAuthorised) {
                console.log(`📡 Status is ${eventType}. Triggering Capture for ${tamaraOrderId}...`);
                captureTamaraPayment(
                    tamaraOrderId,
                    activeOrder.settlementTotal || activeOrder.total,
                    activeOrder.settlementCurrency || "AED"
                );
            } else {
                console.log(`ℹ️ Status is ${eventType}. Waiting for 'authorised' event before capture.`);
            }
        }

        // 5. Handle Failure Events
        else if (["order_failed", "order_cancelled", "order_declined", "order_expired", "failed", "cancelled"].includes(eventType)) {
            await Order.findOneAndUpdate(
                { _id: order._id, paymentStatus: "pending" },
                {
                    $set: {
                        paymentStatus: "failed",
                        orderStatus: "Cancelled"
                    }
                }
            );
            console.log(`❌ Order ${order._id} marked FAILED via Tamara (${eventType})`);
        }

        // 6. Handle Refund Events
        else if (["order_refunded", "refunded"].includes(eventType)) {
            await Order.findOneAndUpdate(
                { _id: order._id },
                { $set: { paymentStatus: "refunded" } }
            );
            console.log(`↩️ Order ${order._id} marked REFUNDED via Tamara`);
        }

        return res.sendStatus(204);
    } catch (error) {
        console.error("💥 Tamara Webhook Critical Error:", error.message);
        return res.status(500).json({ message: "Webhook handler failed" });
    }
};

module.exports = {
    createTamaraOrder,
    normalizeCountryCode,
    handleTamaraWebhook
};
