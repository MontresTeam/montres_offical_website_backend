require("dotenv").config();
const mongoose = require("mongoose");
const stripePkg = require("stripe");
const axios = require("axios");

const Order = require("../models/OrderModel");

const LIVE_STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const LIVE_TABBY_SECRET = process.env.TABBY_SECRET_KEY;
const LIVE_TABBY_BASE = process.env.TABBY_BASE_URL || "https://api.tabby.ai/api/v2";

const stripe = stripePkg(LIVE_STRIPE_SECRET);

async function runDiagnostics() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB successfully.\n");

    // Fetch all orders sorted by createdAt desc
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
    console.log(`Total Orders in Database: ${orders.length}\n`);

    // Group orders by paymentMethod and paymentStatus
    const summary = {};
    for (const ord of orders) {
      const pm = ord.paymentMethod || "unknown";
      const ps = ord.paymentStatus || "unknown";
      const os = ord.orderStatus || "unknown";
      const key = `${pm} | paymentStatus: ${ps} | orderStatus: ${os}`;
      summary[key] = (summary[key] || 0) + 1;
    }

    console.log("=== ORDER STATUS SUMMARY ===");
    console.table(summary);
    console.log("\n");

    // 1. Diagnose Stripe Orders
    console.log("==================================================");
    console.log("🔎 ANALYZING STRIPE ORDERS");
    console.log("==================================================");
    const stripeOrders = orders.filter(o => o.paymentMethod === "stripe");
    console.log(`Found ${stripeOrders.length} Stripe orders in DB.\n`);

    for (const ord of stripeOrders) {
      console.log(`--- Order: ${ord.orderNumber || ord._id} (ID: ${ord._id}) ---`);
      console.log(`  Created At: ${ord.createdAt}`);
      console.log(`  Total: ${ord.total} ${ord.currency || 'AED'}`);
      console.log(`  DB Status: paymentStatus=${ord.paymentStatus}, orderStatus=${ord.orderStatus}`);
      console.log(`  stripeSessionId: ${ord.stripeSessionId || 'NONE'}`);
      console.log(`  stripePaymentIntentId: ${ord.stripePaymentIntentId || 'NONE'}`);
      console.log(`  Customer Email: ${ord.shippingAddress?.email || ord.billingAddress?.email || 'N/A'}`);

      if (ord.stripeSessionId) {

        try {
          const session = await stripe.checkout.sessions.retrieve(ord.stripeSessionId);
          console.log(`  [Stripe Live Session]`);
          console.log(`    Status: ${session.status}`);
          console.log(`    Payment Status: ${session.payment_status}`);
          console.log(`    Payment Intent ID: ${session.payment_intent}`);
          console.log(`    Amount Total: ${session.amount_total / 100} ${session.currency?.toUpperCase()}`);
          console.log(`    Customer Details: ${JSON.stringify(session.customer_details)}`);

          if (session.payment_intent) {
            try {
              const pi = await stripe.paymentIntents.retrieve(typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id);
              console.log(`    [Payment Intent Details]`);
              console.log(`      PI Status: ${pi.status}`);
              console.log(`      Amount: ${pi.amount / 100} ${pi.currency?.toUpperCase()}`);
              console.log(`      Amount Received: ${pi.amount_received / 100}`);
              if (pi.last_payment_error) {
                console.log(`      ❌ Last Payment Error: ${pi.last_payment_error.message} (${pi.last_payment_error.code} / ${pi.last_payment_error.decline_code})`);
              }
              if (pi.charges && pi.charges.data.length > 0) {
                const charge = pi.charges.data[0];
                console.log(`      Charge: status=${charge.status}, paid=${charge.paid}, outcome=${JSON.stringify(charge.outcome)}`);
              }
            } catch (piErr) {
              console.log(`      Error retrieving PaymentIntent: ${piErr.message}`);
            }
          }
        } catch (sErr) {
          console.log(`  ❌ Live Stripe Session Retrieval Failed: ${sErr.message}`);
        }
      } else if (ord.stripePaymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(ord.stripePaymentIntentId);
          console.log(`  [Direct Payment Intent Details]`);
          console.log(`    PI Status: ${pi.status}`);
          if (pi.last_payment_error) {
            console.log(`    ❌ Last Payment Error: ${pi.last_payment_error.message} (${pi.last_payment_error.code} / ${pi.last_payment_error.decline_code})`);
          }
        } catch (piErr) {
          console.log(`  ❌ Error retrieving PaymentIntent: ${piErr.message}`);
        }
      }
      console.log("");
    }

    // 2. Also check recent Stripe Live events/sessions/payment intents directly from Stripe API
    console.log("==================================================");
    console.log("🔎 RECENT STRIPE SESSIONS / PAYMENT INTENTS DIRECT FROM STRIPE API");
    console.log("==================================================");
    try {
      const recentSessions = await stripe.checkout.sessions.list({ limit: 15 });
      console.log(`Found ${recentSessions.data.length} recent Stripe checkout sessions:`);
      for (const s of recentSessions.data) {
        console.log(`  Session ${s.id}: status=${s.status}, payment_status=${s.payment_status}, amount=${s.amount_total / 100} ${s.currency?.toUpperCase()}, created=${new Date(s.created * 1000).toISOString()}, metadata=${JSON.stringify(s.metadata)}`);
      }
    } catch (e) {
      console.log(`Error listing Stripe checkout sessions: ${e.message}`);
    }

    console.log("\nRecent Stripe PaymentIntents:");
    try {
      const recentPIs = await stripe.paymentIntents.list({ limit: 15 });
      for (const pi of recentPIs.data) {
        console.log(`  PI ${pi.id}: status=${pi.status}, amount=${pi.amount / 100} ${pi.currency?.toUpperCase()}, created=${new Date(pi.created * 1000).toISOString()}, last_error=${pi.last_payment_error?.message || 'none'}, metadata=${JSON.stringify(pi.metadata)}`);
      }
    } catch (e) {
      console.log(`Error listing Stripe payment intents: ${e.message}`);
    }

    // 3. Diagnose Tabby Orders
    console.log("\n==================================================");
    console.log("🔎 ANALYZING TABBY ORDERS");
    console.log("==================================================");
    const tabbyOrders = orders.filter(o => o.paymentMethod === "tabby");
    console.log(`Found ${tabbyOrders.length} Tabby orders in DB.\n`);

    const tabbyHeaders = {
      Authorization: `Bearer ${LIVE_TABBY_SECRET}`,
      "Content-Type": "application/json"
    };

    for (const ord of tabbyOrders) {
      console.log(`--- Order: ${ord.orderNumber || ord.orderId || ord._id} (ID: ${ord._id}) ---`);
      console.log(`  Created At: ${ord.createdAt}`);
      console.log(`  Total: ${ord.total} ${ord.currency || 'AED'}`);
      console.log(`  DB Status: paymentStatus=${ord.paymentStatus}, orderStatus=${ord.orderStatus}`);
      console.log(`  tabbySessionId: ${ord.tabbySessionId || 'NONE'}`);
      console.log(`  tabbyCaptureId: ${ord.tabbyCaptureId || 'NONE'}`);
      console.log(`  Customer Email: ${ord.shippingAddress?.email || 'N/A'}, Phone: ${ord.shippingAddress?.phone || 'N/A'}`);

      if (ord.tabbySessionId) {
        // Try /payments/{id}
        let found = false;
        try {
          const resPay = await axios.get(`${LIVE_TABBY_BASE}/payments/${ord.tabbySessionId}`, { headers: tabbyHeaders, timeout: 5000 });
          console.log(`  [Tabby Live Payment]`);
          console.log(`    Status: ${resPay.data?.status}`);
          console.log(`    Amount: ${resPay.data?.amount} ${resPay.data?.currency}`);
          console.log(`    Captures: ${JSON.stringify(resPay.data?.captures)}`);
          console.log(`    Refunds: ${JSON.stringify(resPay.data?.refunds)}`);
          console.log(`    Rejection Reason: ${resPay.data?.rejection_reason || 'none'}`);
          found = true;
        } catch (pErr) {
          console.log(`    /payments/${ord.tabbySessionId} returned: ${pErr.response?.status || pErr.message}`);
        }

        if (!found) {
          try {
            const resChk = await axios.get(`${LIVE_TABBY_BASE}/checkout/${ord.tabbySessionId}`, { headers: tabbyHeaders, timeout: 5000 });
            console.log(`  [Tabby Live Checkout]`);
            console.log(`    Status: ${resChk.data?.status}`);
            console.log(`    Payment Status: ${resChk.data?.payment?.status}`);
            console.log(`    Payment ID: ${resChk.data?.payment?.id}`);
            console.log(`    Rejection: ${JSON.stringify(resChk.data?.warnings || resChk.data?.rejections || resChk.data?.status)}`);
            found = true;
          } catch (cErr) {
            console.log(`    /checkout/${ord.tabbySessionId} returned: ${cErr.response?.status || cErr.message}`);
          }
        }
      }
      console.log("");
    }

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("Diagnostic Error:", error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

runDiagnostics();
