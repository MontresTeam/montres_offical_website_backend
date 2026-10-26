const Order = require("../models/OrderModel");
const Product = require("../models/product");
const User = require("../models/UserModel");
const { calculateShippingFee } = require("../utils/shippingCalculator");
const { validateAndPriceItems, verifyExistingOrder } = require("../utils/pricingHelper");
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
        if (cleaned.startsWith("97105")) return "+971" + cleaned.substring(4);
        if (cleaned.startsWith("971")) return "+" + cleaned;
        if (cleaned.startsWith("05")) return "+971" + cleaned.substring(1);
        if (cleaned.length === 9 && cleaned.startsWith("5")) return "+971" + cleaned;
    } else if (c === "SA") {
        if (cleaned.startsWith("96605")) return "+966" + cleaned.substring(4);
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

(function tamaraBootCheck() {
    const secretKey = process.env.TAMARA_SECRET_KEY;
    if (secretKey) {
        console.log("Tamara configuration: configured");
    } else {
        console.warn("Tamara configuration: missing");
    }
})();

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
// DUAL CREDENTIALS HELPER (UAE vs KSA)
// ==================================================
const getTamaraSecretKey = (country = "AE") => {
    const c = normalizeCountryCode(country);
    if (c === "SA") {
        return process.env.TAMARA_KSA_SECRET_KEY || process.env.TAMARA_SECRET_KEY;
    }
    return process.env.TAMARA_UAE_SECRET_KEY || process.env.TAMARA_SECRET_KEY;
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

            // Verify order ownership, status, and subtotal integrity
            const buyerEmail = shippingAddress?.email || billingAddress?.email || req.user?.email || "";
            verifyExistingOrder(order, req.user, buyerEmail);

            populatedItems = order.items;
            subtotal = order.subtotal;

            const calc = calculateShippingFee({
                country: countryCode,
                subtotal
            });
            shippingFee = calc.shippingFee;
            total = Number((subtotal + shippingFee).toFixed(2));

            order.shippingAddress = shippingAddress || order.shippingAddress;
            order.billingAddress = finalBillingAddress || order.billingAddress;
            order.shippingFee = shippingFee;
            order.total = total;
            order.currency = orderCurrency;
            order.settlementCurrency = orderCurrency;
            order.paymentMethod = "tamara";
            await order.save();
        } else {
            // ===============================
            // SERVER-SIDE PRICING & VALIDATION
            // ===============================
            const pricing = await validateAndPriceItems(items);
            populatedItems = pricing.populatedItems;
            subtotal = pricing.subtotal;

            const calc = calculateShippingFee({
                country: countryCode,
                subtotal
            });
            shippingFee = calc.shippingFee;
            total = Number((subtotal + shippingFee).toFixed(2));

            if (total <= 0 || !Number.isFinite(total)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid order total calculated"
                });
            }

            order = await Order.create({
                userId,
                items: populatedItems,
                subtotal,
                originalPrice: pricing.originalPriceTotal,
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
        const tamaraSecretKey = getTamaraSecretKey(countryCode);

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

        console.log(`Tamara Order Initiated: ${orderId} (${tamaraTotal} ${orderCurrency})`);

        const tamaraResponse = await axios.post(
            `${process.env.TAMARA_API_BASE}/checkout`,
            tamaraPayload,
            {
                headers: {
                    Authorization: `Bearer ${tamaraSecretKey}`,
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
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        const errMessage = error.response?.data?.message || error.response?.data?.error_code || error.message;
        console.error("TAMARA ERROR:", errMessage);

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
        console.log("ℹ️ Tamara development mode - signature verified");
        return true;
    }

    const signature =
        req.headers["x-tamara-signature"] ||
        req.headers["x-tamara-notification-signature"] ||
        req.headers["tamara-signature"] ||
        req.headers["signature"] ||
        req.headers["authorization"];

    if (!signature) {
        console.error("❌ Tamara signature header missing");
        return false;
    }

    const allowedTokens = [
        process.env.TAMARA_UAE_NOTIFICATION_KEY,
        process.env.TAMARA_KSA_NOTIFICATION_KEY,
        process.env.TAMARA_NOTIFICATION_KEY,
        process.env.TAMARA_WEBHOOK_SECRET,
    ].filter(Boolean);

    // Direct token comparison (Notification token / Bearer)
    for (const token of allowedTokens) {
        if (
            signature === token ||
            signature === `Bearer ${token}` ||
            signature.trim() === token.trim()
        ) {
            return true;
        }
    }

    // HMAC SHA-256 comparison against both tokens
    const payload = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    for (const token of allowedTokens) {
        try {
            const expectedSignature = crypto
                .createHmac("sha256", token)
                .update(payload)
                .digest("hex");

            const signatureBuffer = Buffer.from(signature);
            const expectedBuffer = Buffer.from(expectedSignature);

            if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
                return true;
            }
        } catch {
            // continue
        }
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
                Authorization: `Bearer ${tamaraSecretKey}`,
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
        const response = await axios.post(`${process.env.TAMARA_API_BASE}/orders/${tamaraOrderId}/authorise`, {}, {
            headers: {
                Authorization: `Bearer ${tamaraSecretKey}`,
                "Content-Type": "application/json",
            },
        });

        const status = (response.data?.status || "").toLowerCase();
        if (["authorised", "authorized", "fully_authorised", "fully_captured"].includes(status) || response.data?.order_id) {
            console.log(`✅ Tamara Authorisation Success for ${tamaraOrderId}`);
            return true;
        }
        console.warn(`⚠️ Tamara Authorisation status: ${response.data?.status}`);
        return false;
    } catch (err) {
        const errorData = err.response?.data;
        if (errorData?.errors?.some(e => e.error_code === "transition_not_allowed" || e.error_code === "order_already_authorised")) {
            console.warn(`⚠️ Tamara Authorisation: Already in target state for ${tamaraOrderId}`);
            return true;
        }
        console.error("❌ Tamara Authorisation Error:", errorData || err.message);
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
                Authorization: `Bearer ${tamaraSecretKey}`,
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
// GET TAMARA PAYMENT TYPES & ELIGIBILITY (PUBLIC API)
// ==================================================
const getTamaraPaymentTypes = async (req, res) => {
    try {
        const rawCountry = req.query.country || req.body?.country || "AE";
        const country = normalizeCountryCode(rawCountry);
        const currency = (req.query.currency || req.body?.currency || (country === "SA" ? "SAR" : "AED")).toUpperCase();
        const orderValue = Number(req.query.orderValue || req.query.order_value || req.body?.orderValue || req.body?.order_value || 500);
        const rawPhone = req.query.phone || req.body?.phone || (country === "SA" ? "+966500000001" : "+971500000001");
        const phone = formatPhone(rawPhone, country) || rawPhone;

        const response = await axios.get(`${process.env.TAMARA_API_BASE}/checkout/payment-types`, {
            headers: {
                Authorization: `Bearer ${tamaraSecretKey}`,
                "Content-Type": "application/json",
            },
            params: {
                country,
                currency,
                order_value: orderValue,
                phone,
            },
        });

        return res.status(200).json({
            success: true,
            country,
            currency,
            orderValue,
            paymentTypes: response.data || [],
        });
    } catch (error) {
        console.error("❌ Tamara Payment Types Error:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            message: "Failed to fetch Tamara payment types",
            error: error.response?.data || error.message,
        });
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
                // If authorisation fails, return 500 to let Tamara retry the webhook
                return res.status(500).send("Authorisation failed, retrying...");
            }
        }

        // 5. Handle Success Events (Authorised / Captured)
        const isSuccessEvent = ["order_authorized", "order_authorised", "authorised", "order_approved", "approved"].includes(eventType);

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
            console.log(`📡 Status is ${eventType}. Triggering Capture for ${tamaraOrderId}...`);
            captureTamaraPayment(
                tamaraOrderId,
                activeOrder.total,
                activeOrder.currency || (activeOrder.shippingAddress?.country === "SA" ? "SAR" : "AED")
            );
        }

        // 6. Handle Captured Events
        else if (["order_captured", "captured", "fully_captured"].includes(eventType)) {
            await Order.findOneAndUpdate(
                { _id: order._id, paymentStatus: { $ne: "paid" } },
                {
                    $set: {
                        paymentStatus: "paid",
                        orderStatus: "Paid / Awaiting Shipment",
                        tamaraOrderId: tamaraOrderId,
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

        // 8. Handle Refund Events
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
            total_amount: { amount: Number(amount.toFixed(2)), currency: currency },
            comment: "Admin initiated cancellation"
        };

        const response = await axios.post(`${process.env.TAMARA_API_BASE}/orders/${tamaraOrderId}/cancel`, cancelPayload, {
            headers: {
                Authorization: `Bearer ${tamaraSecretKey}`,
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
const refundTamaraPayment = async (tamaraOrderId, amount, currency = "AED", comment = "Admin initiated refund") => {
    try {
        console.log(`🚀 Refunding Tamara Order: ${tamaraOrderId} (${amount} ${currency})`);
        const formattedAmount = Number(amount.toFixed(2));
        const refundPayload = {
            order_id: tamaraOrderId,
            total_amount: { amount: formattedAmount, currency: currency },
            comment: comment,
            refunds: [
                {
                    total_amount: { amount: formattedAmount, currency: currency },
                    comment: comment
                }
            ]
        };

        const response = await axios.post(`${process.env.TAMARA_API_BASE}/payments/refund`, refundPayload, {
            headers: {
                Authorization: `Bearer ${tamaraSecretKey}`,
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

// ==================================================
// SYNC TAMARA ORDERS (BACKGROUND RECONCILIATION)
// ==================================================
const syncTamaraOrders = async () => {
    try {
        const pendingTamaraOrders = await Order.find({
            paymentMethod: "tamara",
            paymentStatus: "pending",
            tamaraOrderId: { $exists: true, $ne: null },
            createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        });

        console.log(`🔄 Found ${pendingTamaraOrders.length} pending Tamara orders for reconciliation`);
        let updatedCount = 0;

        for (const order of pendingTamaraOrders) {
            const tamaraData = await getTamaraOrderStatus(order.tamaraOrderId);
            if (!tamaraData) continue;

            const status = (tamaraData.status || "").toLowerCase();
            console.log(`Order ${order._id} (Tamara ID: ${order.tamaraOrderId}) Status on Tamara: ${status}`);

            if (["authorised", "authorized", "fully_captured", "captured", "paid"].includes(status)) {
                await Order.findByIdAndUpdate(order._id, {
                    $set: {
                        paymentStatus: "paid",
                        orderStatus: "Paid / Awaiting Shipment",
                        paidAt: new Date()
                    }
                });
                updatedCount++;
            } else if (["canceled", "cancelled", "declined", "expired", "failed"].includes(status)) {
                await Order.findByIdAndUpdate(order._id, {
                    $set: {
                        paymentStatus: "failed",
                        orderStatus: "Cancelled"
                    }
                });
                updatedCount++;
            }
        }

        return { success: true, processed: pendingTamaraOrders.length, updated: updatedCount };
    } catch (error) {
        console.error("❌ Tamara sync error:", error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    createTamaraOrder,
    normalizeCountryCode,
    handleTamaraWebhook,
    getTamaraOrderStatus,
    getTamaraPaymentTypes,
    authoriseTamaraOrder,
    captureTamaraPayment,
    cancelTamaraOrder,
    refundTamaraPayment,
    syncTamaraOrders
};
