const Order = require("../models/OrderModel");
const User = require("../models/UserModel");
const sendEmail = require("../utils/sendEmail");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
    telemetry: false, // Disable background requests often causing ECONNRESET on Windows
});
const crypto = require("crypto");

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const TAMARA_WEBHOOK_SECRET = process.env.TAMARA_NOTIFICATION_KEY || process.env.TAMARA_WEBHOOK_SECRET;


const sendOrderConfirmation = require("../utils/sendOrderConfirmation");


const handleStripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    console.log("--------------------------------------------------");
    console.log("🔔 STRIPE WEBHOOK HIT");

    // Check if body is buffer
    const isBuffer = Buffer.isBuffer(req.body);
    console.log(`📦 Body Type: ${typeof req.body}, isBuffer: ${isBuffer}`);

    // If not buffer, and we can't construct event, we might need to rely on the raw-body middleware in routes

    try {
        if (!STRIPE_WEBHOOK_SECRET) {
            console.error("❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not defined in .env!");
            return res.status(500).send("Webhook secret not configured");
        }

        console.log(`🔑 Loaded Secret Prefix: ${STRIPE_WEBHOOK_SECRET.substring(0, 10)}...`);
        console.log(`🔑 Expected Secret Prefix: whsec_a4f...`);


        if (!sig) {
            console.error("❌ ERROR: No stripe-signature header found.");
            return res.status(400).send("Missing signature header");
        }

        // Stripe requires the RAW body for verification. 
        // In our route we used express.raw(), so req.body SHOULD be a buffer.
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        console.log(`✅ Signature Verified. Event Type: ${event.type}`);
    } catch (err) {
        console.error(`❌ Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const orderId = session.metadata?.orderId;

            console.log(`🔄 Processing session for Order: ${orderId}`);

            if (orderId) {
                // Check if order exists before updating
                const existingOrder = await Order.findById(orderId);
                if (!existingOrder) {
                    console.error(`❌ ERROR: Order ${orderId} found in metadata but NOT in database!`);
                    return res.status(404).send("Order not found");
                }

                if (existingOrder.paymentStatus === "paid") {
                    console.log(`ℹ️ Order ${orderId} is already marked as PAID.`);
                }

                // IDEMPOTENCY: Atomic update
                // This ensures we only run logic if status was NOT 'paid'
                const order = await Order.findOneAndUpdate(
                    { _id: orderId, paymentStatus: { $ne: "paid" } },
                    {
                        $set: {
                            paymentStatus: "paid",
                            stripePaymentIntentId: session.payment_intent,
                            orderStatus: "Processing",
                            paidAt: new Date()
                        }
                    },
                    { new: true }
                );

                // We use existingOrder as fallback if order is null (meaning it was already paid)
                const targetOrder = order || existingOrder;

                if (targetOrder) {
                    // Update user: Clear cart and add order to orders array
                    if (targetOrder.userId) {
                        await User.findByIdAndUpdate(targetOrder.userId, {
                            $set: { cart: [] },
                            $addToSet: { orders: targetOrder._id }
                        });
                        console.log(`🛒 Cart sync'd for user: ${targetOrder.userId}`);
                    }

                    // Send email only if we just marked it as paid (order is not null)
                    if (order) {
                        await sendOrderConfirmation(order._id);
                    }
                }
            } else {
                console.error("❌ ERROR: orderId missing from Stripe session metadata!");
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error(`❌ Webhook Processing Exception: ${error.message}`);
        res.status(500).json({ error: "Internal processing error" });
    }
    console.log("--------------------------------------------------");
};

// ===============================
// Tamara Webhook Helpers
// ===============================
const verifyTamaraSignature = (req) => {
    // Sandbox → no signature if set explicitly or if in development
    if (process.env.NODE_ENV !== "production") {
        console.log("⚠️ Tamara sandbox mode – skipping signature verification");
        return true;
    }

    const signature =
        req.headers["x-tamara-signature"] ||
        req.headers["x-tamara-notification-signature"];

    if (!signature) {
        console.error("Tamara signature header missing");
        return false;
    }

    if (!TAMARA_WEBHOOK_SECRET) {
        console.error("TAMARA_WEBHOOK_SECRET (or TAMARA_NOTIFICATION_KEY) missing in .env");
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", TAMARA_WEBHOOK_SECRET)
        .update(req.body)
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

// ===============================
// Tamara Webhook Handler
// ===============================
const handleTamaraWebhook = async (req, res) => {
    try {
        console.log("--------------------------------------------------");
        console.log("🔔 TAMARA WEBHOOK HIT");

        // Verify signature (skips in dev)
        if (!verifyTamaraSignature(req)) {
            console.error("❌ Invalid Tamara signature attempt");
            return res.status(401).json({ message: "Invalid signature" });
        }

        const notification = JSON.parse(req.body.toString());
        console.log("📦 Tamara Notification:", JSON.stringify(notification, null, 2));

        const orderId = notification.order_reference_id;
        const status = notification.event_type || notification.order_status;

        // ✅ APPROVED / AUTHORIZED
        if (status === "approved" || status === "order_authorized") {
            const order = await Order.findOneAndUpdate(
                { _id: orderId, paymentStatus: { $ne: "paid" } },
                {
                    paymentStatus: "paid",
                    orderStatus: "Processing",
                    paidAt: new Date(),
                    tamaraOrderId: notification.order_id,
                },
                { new: true }
            );

            const currentOrder = order || await Order.findById(orderId);

            if (currentOrder?.userId) {
                // Sync user cart and orders list
                await User.findByIdAndUpdate(currentOrder.userId, {
                    $set: { cart: [] },
                    $addToSet: { orders: currentOrder._id },
                });
                console.log(`🛒 Cart cleared for user: ${currentOrder.userId}`);

                if (order) {
                    await sendOrderConfirmation(order._id);
                    console.log(`✅ Order ${orderId} marked PAID via Tamara`);
                }
            }
        }
        // ❌ FAILED / CANCELLED
        else if (
            status === "order_failed" ||
            status === "order_cancelled" ||
            status === "order_declined" ||
            status === "failed" ||
            status === "cancelled"
        ) {
            await Order.findOneAndUpdate(
                { _id: orderId, paymentStatus: { $ne: "paid" } },
                {
                    paymentStatus: "failed",
                    orderStatus: "Cancelled",
                }
            );

            console.log(`❌ Order ${orderId} marked FAILED/CANCELLED via Tamara`);
        }

        console.log("--------------------------------------------------");
        return res.sendStatus(204);
    } catch (error) {
        console.error("❌ Tamara Webhook Error:", error);
        return res.status(500).json({ message: "Webhook handler failed" });
    }
};

module.exports = {
    handleStripeWebhook,
    handleTamaraWebhook,
};