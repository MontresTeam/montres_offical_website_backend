const Order = require("../models/OrderModel");
const User = require("../models/UserModel");
const sendEmail = require("../utils/sendEmail");
const stripePkg = require("stripe");
const stripe = process.env.STRIPE_SECRET_KEY
    ? stripePkg(process.env.STRIPE_SECRET_KEY, { telemetry: false })
    : null;
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
        if (!stripe || !STRIPE_WEBHOOK_SECRET) {
            console.error("❌ CRITICAL: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not defined in .env!");
            return res.status(500).send("Webhook secret or key not configured");
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

                // IDEMPOTENCY: Atomic update
                const order = await Order.findOneAndUpdate(
                    { _id: orderId, paymentStatus: { $ne: "paid" } },
                    {
                        $set: {
                            paymentStatus: "paid",
                            stripePaymentIntentId: session.payment_intent,
                            orderStatus: "Paid / Awaiting Shipment",
                            paidAt: new Date()
                        }
                    },
                    { new: true }
                );

                const targetOrder = order || existingOrder;

                if (targetOrder) {
                    if (targetOrder.userId) {
                        await User.findByIdAndUpdate(targetOrder.userId, {
                            $set: { cart: [] },
                            $addToSet: { orders: targetOrder._id }
                        });
                        console.log(`🛒 Cart sync'd for user: ${targetOrder.userId}`);
                    }

                    if (order) {
                        sendOrderConfirmation(order._id)
                            .catch(e => console.error(`📧 Email Error for order ${order._id}:`, e.message));
                    }
                }
            } else {
                console.error("❌ ERROR: orderId missing from Stripe session metadata!");
            }
        }

        else if (event.type === "payment_intent.payment_failed") {
            const paymentIntent = event.data.object;
            const orderId = paymentIntent.metadata?.orderId;
            const failureMessage = paymentIntent.last_payment_error?.message || "Unknown reason";

            console.log(`❌ Payment FAILED for Order: ${orderId} — Reason: ${failureMessage}`);

            if (orderId) {
                const failedOrder = await Order.findOneAndUpdate(
                    {
                        _id: orderId,
                        paymentStatus: { $ne: "paid" }
                    },
                    {
                        $set: {
                            paymentStatus: "failed",
                            orderStatus: "Cancelled"
                        }
                    },
                    { new: true }
                );

                if (failedOrder) {
                    console.log(`❌ Order ${failedOrder._id} marked FAILED via Webhook`);
                }
            }
        }

        else if (event.type === "checkout.session.expired") {
            const session = event.data.object;
            const orderId = session.metadata?.orderId;
            console.log(`⏱️ Stripe Checkout Session EXPIRED for Order: ${orderId}`);
            if (orderId) {
                await Order.findOneAndUpdate(
                    { _id: orderId, paymentStatus: { $ne: "paid" } },
                    {
                        $set: {
                            paymentStatus: "failed",
                            orderStatus: "Cancelled"
                        }
                    }
                );
            }
        }

        else if (event.type === "payment_intent.canceled") {
            const paymentIntent = event.data.object;
            const orderId = paymentIntent.metadata?.orderId;
            console.log(`❌ Payment Intent CANCELED for Order: ${orderId}`);
            if (orderId) {
                await Order.findOneAndUpdate(
                    { _id: orderId, paymentStatus: { $ne: "paid" } },
                    {
                        $set: {
                            paymentStatus: "failed",
                            orderStatus: "Cancelled"
                        }
                    }
                );
            }
        }

        else if (event.type === "charge.refunded") {
            const charge = event.data.object;
            const orderId = charge.metadata?.orderId;

            if (orderId) {
                await Order.findOneAndUpdate(
                    { _id: orderId },
                    { $set: { paymentStatus: "refunded" } }
                );
                console.log(`↩️ Order ${orderId} marked REFUNDED via Stripe Webhook`);
            }
        }

        else {
            console.log(`ℹ️ Unhandled Stripe event type: ${event.type}`);
        }

        console.log("--------------------------------------------------");
        res.json({ received: true });
    } catch (error) {
        console.error(`❌ Webhook Processing Exception: ${error.message}`);
        res.status(500).json({ error: "Internal processing error" });
    }
};

module.exports = {
    handleStripeWebhook,
};