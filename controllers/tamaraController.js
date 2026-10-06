const Order = require("../models/OrderModel");
const Product = require("../models/product");
const User = require("../models/UserModel");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const sendOrderConfirmation = require("../utils/sendOrderConfirmation");
const axios = require("axios");
const crypto = require("crypto");

// ==================================================
// PHONE FORMATTING HELPER (Matches Tabby logic)
// ==================================================
const formatPhone = (p, country = "AE") => {
    if (!p) return undefined;
    let cleaned = p.replace(/\D/g, "");
    const c = (country || "AE").toUpperCase();

    if (c === "AE") {
        if (cleaned.startsWith("971")) return "+" + cleaned;
        if (cleaned.startsWith("05")) return "+971" + cleaned.substring(1);
        if (cleaned.length === 9 && cleaned.startsWith("5")) return "+971" + cleaned;
    } else if (c === "SA") {
        if (cleaned.startsWith("966")) return "+" + cleaned;
        if (cleaned.startsWith("05")) return "+966" + cleaned.substring(1);
        if (cleaned.length === 9 && cleaned.startsWith("5")) return "+966" + cleaned;
    }
    
    if (cleaned.startsWith("00")) return "+" + cleaned.substring(2);
    return "+" + (cleaned.startsWith("+") ? cleaned : cleaned);
};

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
// CREATE TAMARA ORDER (SUPPORT SAUDI ARABIA & UAE)
// ==================================================
const createTamaraOrder = async (req, res) => {
    try {
        const userId = req.user?.userId || null;
        // Guest checkout is allowed; userId can be null

        const {
            items = [],
            shippingAddress,
            billingAddress,
            instalments = 4,
            currency: requestedCurrency,
        } = req.body || {};

        // ===============================
        // COUNTRY & CURRENCY RESOLUTION
        // ===============================
        const rawCountry = shippingAddress?.country || billingAddress?.country || "AE";
        const countryCode = normalizeCountryCode(rawCountry);

        // Currency: default to SAR for Saudi Arabia, AED for UAE, or requestedCurrency
        const orderCurrency = requestedCurrency 
            ? requestedCurrency.toUpperCase()
            : (countryCode === "SA" ? "SAR" : "AED");

        // ===============================
        // PHONE VALIDATION
        // ===============================
        const rawPhone = shippingAddress?.phone || billingAddress?.phone;
        const buyerPhone = formatPhone(rawPhone, countryCode);

        if (!buyerPhone) {
            return res.status(400).json({
                success: false,
                message: `A valid mobile phone number is required for Tamara (${countryCode === "SA" ? "Saudi Arabia +966" : "UAE +971"}).`,
            });
        }

        if (countryCode === "SA" && !buyerPhone.startsWith("+966")) {
            return res.status(400).json({
                success: false,
                message: "A valid Saudi phone number starting with +966 is required for Tamara in Saudi Arabia.",
            });
        }

        if (countryCode === "AE" && !buyerPhone.startsWith("+971")) {
            return res.status(400).json({
                success: false,
                message: "A valid UAE phone number starting with +971 is required for Tamara in the UAE.",
            });
        }

        const ALLOWED_INSTALLMENTS = [2, 3, 4, 6, 12];

        if (!ALLOWED_INSTALLMENTS.includes(Number(instalments))) {
            return res.status(400).json({
                success: false,
                message: "Allowed instalments: 2, 3, 4, 6",
            });
        }

        const finalBillingAddress =
            billingAddress?.address1 && billingAddress?.city
                ? billingAddress
                : shippingAddress;

        const { existingOrderId } = req.body;
        let order;
        let populatedItems = [];
        let subtotal = 0;
        let shippingFee = 0;
        let total = 0;

        if (existingOrderId) {
            order = await Order.findById(existingOrderId);
            if (!order) return res.status(404).json({ success: false, message: "Existing order not found" });

            populatedItems = order.items;
            subtotal = order.subtotal;

            const calc = calculateShippingFee({
                country: countryCode,
                subtotal
            });
            shippingFee = calc.shippingFee;
            total = subtotal + shippingFee;

            order.shippingAddress = shippingAddress;
            order.billingAddress = finalBillingAddress;
            order.shippingFee = shippingFee;
            order.total = total;
            order.currency = orderCurrency;
            order.settlementCurrency = orderCurrency;
            order.paymentMethod = "tamara";
            await order.save();
        } else {
            // ===============================
            // FETCH PRODUCTS for new order
            // ===============================
            populatedItems = await Promise.all(
                items.map(async (it) => {
                    const product = await Product.findById(it.productId)
                        .select("name images salePrice regularPrice stockQuantity published sku")
                        .lean();

                    if (!product) throw new Error("Product not found");
                    if (!product.published) throw new Error("Product unavailable");

                    const price = it.price || it.unit_price || product.salePrice || product.regularPrice || 0;

                    return {
                        productId: product._id,
                        name: product.name,
                        image: product.images?.[0]?.url || "",
                        price: Number(price),
                        regularPrice: product.regularPrice,
                        quantity: Number(it.quantity) || 1,
                        sku: product.sku || product._id.toString(),
                    };
                })
            );

            subtotal = populatedItems.reduce(
                (acc, item) => acc + item.price * item.quantity,
                0
            );

            const calc = calculateShippingFee({
                country: countryCode,
                subtotal
            });
            shippingFee = calc.shippingFee;
            total = subtotal + shippingFee;

            const originalPriceTotal = populatedItems.reduce((acc, item) => acc + (item.regularPrice || item.price) * item.quantity, 0);

            order = await Order.create({
                userId,
                items: populatedItems,
                subtotal,
                originalPrice: originalPriceTotal,
                shippingFee,
                total,
                vat: 0,
                currency: orderCurrency,
                settlementCurrency: orderCurrency,
                fxRate: 1,
                shippingAddress,
                billingAddress: finalBillingAddress,
                paymentMethod: "tamara",
                paymentStatus: "pending",
            });
        }

        const orderId = order._id.toString();

        // ===============================
        // TAMARA ITEMS & TOTAL
        // ===============================
        const tamaraItems = order.items.map((item) => ({
            name: item.name.trim(),
            type: "Physical",
            reference_id: item.productId?.toString() || item.sku,
            sku: item.sku || item.productId?.toString(),
            quantity: item.quantity,
            unit_price: {
                amount: Number(item.price.toFixed(2)),
                currency: orderCurrency,
            },
            total_amount: {
                amount: Number((item.price * item.quantity).toFixed(2)),
                currency: orderCurrency,
            },
        }));

        const tamaraTotal = Number(order.total.toFixed(2));

        const baseUrl =
            process.env.CLIENT_URL ||
            "https://www.montres.ae";

        const backendUrl =
            process.env.BACKEND_URL ||
            "https://api.montres.ae";

        const tamaraPayload = {
            order_reference_id: orderId,
            order_number: order.orderNumber || orderId,
            description: `Order ${order.orderNumber || orderId} - Montres`,
            total_amount: {
                amount: tamaraTotal,
                currency: orderCurrency,
            },
            shipping_amount: {
                amount: Number(shippingFee.toFixed(2)),
                currency: orderCurrency,
            },
            tax_amount: {
                amount: 0,
                currency: orderCurrency,
            },
            items: tamaraItems,
            consumer: {
                first_name: shippingAddress.firstName || "Customer",
                last_name: shippingAddress.lastName || "",
                email: shippingAddress.email || req.user?.email || "customer@montres.ae",
                phone_number: buyerPhone,
            },
            billing_address: {
                first_name: finalBillingAddress.firstName || shippingAddress.firstName || "Customer",
                last_name: finalBillingAddress.lastName || shippingAddress.lastName || "",
                line1: finalBillingAddress.address1 || finalBillingAddress.street || "Main St",
                line2: finalBillingAddress.address2 || "",
                city: finalBillingAddress.city || "Riyadh",
                region: finalBillingAddress.region || finalBillingAddress.city || "Riyadh",
                country_code: countryCode,
                phone_number: formatPhone(finalBillingAddress.phone, countryCode) || buyerPhone,
            },
            shipping_address: {
                first_name: shippingAddress.firstName || "Customer",
                last_name: shippingAddress.lastName || "",
                line1: shippingAddress.address1 || shippingAddress.street || "Main St",
                line2: shippingAddress.address2 || "",
                city: shippingAddress.city || "Riyadh",
                region: shippingAddress.region || shippingAddress.city || "Riyadh",
                country_code: countryCode,
                phone_number: buyerPhone,
            },
            country_code: countryCode,
            locale: countryCode === "SA" ? "ar_SA" : "en_US",
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
        req.headers["x-tamara-notification-signature"] ||
        req.headers["tamara-signature"] ||
        req.headers["signature"] ||
        req.headers["authorization"];

    const webhookSecret = process.env.TAMARA_WEBHOOK_SECRET || process.env.TAMARA_NOTIFICATION_KEY;

    if (!signature) {
        console.error("❌ Tamara signature header missing");
        return false;
    }

    if (!webhookSecret) {
        console.error("❌ TAMARA_WEBHOOK_SECRET missing in .env");
        return false;
    }

    // Direct token comparison (Notification token / Bearer)
    if (
        signature === webhookSecret ||
        signature === `Bearer ${webhookSecret}` ||
        signature.trim() === webhookSecret.trim()
    ) {
        return true;
    }

    // HMAC SHA-256 comparison
    try {
        const payload = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(payload)
            .digest("hex");

        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            return true;
        }
    } catch (err) {
        console.error("❌ Tamara signature verification error:", err.message);
    }

    return false;
};

// ==================================================
// CAPTURE TAMARA PAYMENT
// ==================================================
const captureTamaraPayment = async (tamaraOrderId, totalAmount, currency = "AED") => {
    try {
        console.log(`🚀 Capturing Tamara Payment: ${tamaraOrderId} (${totalAmount} ${currency})`);
        const capturePayload = {
            order_id: tamaraOrderId,
            total_amount: { amount: Number(totalAmount.toFixed(2)), currency: currency },
            shipping_info: {
                shipping_company: "Shipping",
                tracking_number: "N/A",
                tracking_url: "N/A"
            }
        };

        const response = await axios.post(`${process.env.TAMARA_API_BASE}/payments/capture`, capturePayload, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });

        console.log(`✅ Tamara Capture Success for ${tamaraOrderId}`);
        return true;
    } catch (err) {
        const errorData = err.response?.data;
        // If already captured, don't treat as a total failure
        if (errorData?.errors?.some(e => e.error_code === "transition_not_allowed")) {
            console.warn(`⚠️ Tamara Capture: Transition not allowed (possibly already captured) for ${tamaraOrderId}`);
            return true;
        }
        console.error("❌ Tamara Capture Error:", JSON.stringify(errorData || err.message));
        return false;
    }
};

// ==================================================
// AUTHORISE TAMARA ORDER
// ==================================================
const authoriseTamaraOrder = async (tamaraOrderId) => {
    try {
        console.log(`📡 Authorising Tamara Order: ${tamaraOrderId}`);
        const response = await axios.post(`${process.env.TAMARA_API_BASE}/payments/authorise`, {
            order_id: tamaraOrderId
        }, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });

        if (response.data.status === "authorised" || response.data.status === "fully_authorised") {
            console.log(`✅ Tamara Authorisation Success for ${tamaraOrderId}`);
            return true;
        }
        console.warn(`⚠️ Tamara Authorisation status: ${response.data.status}`);
        return false;
    } catch (err) {
        console.error("❌ Tamara Authorisation Error:", err.response?.data || err.message);
        return false;
    }
};

// ==================================================
// GET TAMARA ORDER STATUS (FOR SYNC FALLBACK)
// ==================================================
const getTamaraOrderStatus = async (tamaraOrderId) => {
    try {
        const response = await axios.get(`${process.env.TAMARA_API_BASE}/orders/${tamaraOrderId}`, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        return response.data;
    } catch (err) {
        console.error("❌ Tamara Get Order Error:", err.response?.data || err.message);
        return null;
    }
};

// ==================================================
// HANDLE TAMARA WEBHOOK
// ==================================================
// ==================================================
// HANDLE TAMARA WEBHOOK
// ==================================================
const handleTamaraWebhook = async (req, res) => {
    try {
        // 1. Verify Signature
        if (!verifyTamaraSignature(req)) {
            return res.status(401).json({ message: "Invalid signature" });
        }

        // 2. Parse Payload (Since it's a Buffer from express.raw)
        let payload = req.body;
        if (Buffer.isBuffer(payload)) {
            try {
                payload = JSON.parse(payload.toString("utf-8"));
            } catch (e) {
                console.error("❌ Failed to parse Tamara webhook buffer:", e.message);
                return res.status(400).send("Invalid JSON");
            }
        }

        console.log("🔔 Tamara Webhook Received:", JSON.stringify(payload, null, 2));

        const orderReferenceId = payload.order_reference_id || payload.order_number;
        const tamaraOrderId = payload.order_id;
        const eventType = (payload.event_type || payload.order_status || "").toLowerCase();

        if (!orderReferenceId) {
            return res.status(200).send("No reference ID");
        }

        // 3. Find Order
        let order = await Order.findById(orderReferenceId);
        if (!order) {
            order = await Order.findOne({ orderId: orderReferenceId });
        }

        if (!order) {
            console.error(`❌ Order not found: ${orderReferenceId}`);
            return res.status(200).send("Order not found");
        }

        // 4. Handle "Approved" Event (Requires Authorization)
        if (["approved", "order_approved"].includes(eventType)) {
            console.log(`📜 Order ${orderReferenceId} is Approved. Proceeding to Authorise...`);
            
            const authorised = await authoriseTamaraOrder(tamaraOrderId);
            if (!authorised) {
                // If authorisation fails, we return 500 to let Tamara retry the webhook
                return res.status(500).send("Authorisation failed, retrying...");
            }
            
            // If authorised, we proceed to update order status (Logic continues in success events block)
        }

        // 5. Handle Success Events (Authorised)
        const isSuccessEvent = ["order_authorized", "order_authorised", "authorised"].includes(eventType) || 
                             (["approved", "order_approved"].includes(eventType)); // Include approved because we just authorised it above

        if (isSuccessEvent) {
            // Idempotent update to PAID
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: order._id, paymentStatus: { $ne: "paid" } },
                {
                    $set: {
                        paymentStatus: "paid",
                        orderStatus: "Paid / Awaiting Shipment",
                        tamaraOrderId: tamaraOrderId,
                        paidAt: new Date()
                    }
                },
                { new: true }
            );

            const activeOrder = updatedOrder || order;

            // Security check
            const tamaraAmount = Number(payload.total_amount?.amount || payload.amount?.amount || 0);
            if (tamaraAmount > 0 && Math.abs(tamaraAmount - activeOrder.total) > 0.5) {
                console.error(`❌ Tamara Amount Mismatch: Received ${tamaraAmount}, Expected ${activeOrder.total}.`);
            }

            if (updatedOrder) {
                if (activeOrder.userId) {
                    User.findByIdAndUpdate(activeOrder.userId, {
                        $set: { cart: [] },
                        $addToSet: { orders: activeOrder._id }
                    }).catch(e => console.error("User update error:", e.message));
                }
                sendOrderConfirmation(activeOrder._id).catch(e => console.error("📧 Email Error:", e.message));
            }

            // AUTO-CAPTURE
            const isAuthorised = ["order_authorized", "order_authorised", "authorised"].includes(eventType) || ["approved", "order_approved"].includes(eventType);
            if (isAuthorised) {
                console.log(`📡 Status is ${eventType}. Triggering Capture for ${tamaraOrderId}...`);
                captureTamaraPayment(
                    tamaraOrderId,
                    activeOrder.total,
                    activeOrder.currency || "AED"
                );
            }
        }

        // 6. Handle Captured Events
        else if (["order_captured", "captured", "fully_captured"].includes(eventType)) {
            await Order.findOneAndUpdate(
                { _id: order._id, paymentStatus: { $ne: "paid" } },
                {
                    $set: {
                        paymentStatus: "paid",
                        orderStatus: "Paid / Awaiting Shipment",
                        paidAt: new Date()
                    }
                }
            );
            console.log(`✅ Order ${order._id} marked PAID via Tamara (Captured)`);
        }

        // 7. Handle Failure Events
        else if (["order_failed", "order_cancelled", "order_declined", "order_expired", "failed", "cancelled", "declined"].includes(eventType)) {
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

        // 7. Handle Refund Events
        else if (["order_refunded", "refunded"].includes(eventType)) {
            await Order.findOneAndUpdate(
                { _id: order._id },
                { $set: { paymentStatus: "refunded" } }
            );
            console.log(`↩️ Order ${order._id} marked REFUNDED via Tamara`);
        }

        return res.status(200).send("OK");
    } catch (error) {
        console.error("💥 Tamara Webhook Critical Error:", error.message);
        return res.status(500).json({ message: "Webhook handler failed" });
    }
};

// ==================================================
// CANCEL TAMARA ORDER
// ==================================================
const cancelTamaraOrder = async (tamaraOrderId, amount, currency = "AED") => {
    try {
        console.log(`🚀 Cancelling Tamara Order: ${tamaraOrderId} (${amount} ${currency})`);
        const cancelPayload = {
            order_id: tamaraOrderId,
            cancel_amount: { amount: Number(amount.toFixed(2)), currency: currency },
            comment: "Admin initiated cancellation"
        };

        const response = await axios.post(`${process.env.TAMARA_API_BASE}/payments/cancel`, cancelPayload, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });

        console.log(`✅ Tamara Cancellation Success for ${tamaraOrderId}`);
        return true;
    } catch (err) {
        console.error("❌ Tamara Cancellation Error:", err.response?.data || err.message);
        return false;
    }
};

// ==================================================
// REFUND TAMARA PAYMENT
// ==================================================
const refundTamaraPayment = async (tamaraOrderId, amount, currency = "AED") => {
    try {
        console.log(`🚀 Refunding Tamara Order: ${tamaraOrderId} (${amount} ${currency})`);
        const refundPayload = {
            order_id: tamaraOrderId,
            refund_amount: { amount: Number(amount.toFixed(2)), currency: currency },
            comment: "Admin initiated refund"
        };

        const response = await axios.post(`${process.env.TAMARA_API_BASE}/payments/refund`, refundPayload, {
            headers: {
                Authorization: `Bearer ${process.env.TAMARA_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });

        console.log(`✅ Tamara Refund Success for ${tamaraOrderId}`);
        return true;
    } catch (err) {
        console.error("❌ Tamara Refund Error:", err.response?.data || err.message);
        return false;
    }
};

module.exports = {
    createTamaraOrder,
    normalizeCountryCode,
    handleTamaraWebhook,
    getTamaraOrderStatus,
    authoriseTamaraOrder,
    captureTamaraPayment,
    cancelTamaraOrder,
    refundTamaraPayment
};
