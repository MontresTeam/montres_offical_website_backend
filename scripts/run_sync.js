process.on('uncaughtException', (err) => {
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
    console.warn(`⚠️ Background network socket drop (${err.code}) - ignored safely`);
    return;
  }
  console.error('Uncaught Exception:', err);
});

require("dotenv").config();
const mongoose = require("mongoose");
const { syncTabbyOrders } = require("../controllers/tabbyController");
const { syncStripeOrders } = require("../controllers/orderController");
const Order = require("../models/OrderModel");

async function runFullSync() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  console.log("\n--- Running Tabby Reconciliation ---");
  const tabbyRes = await syncTabbyOrders();
  console.log("Tabby sync result:", tabbyRes);

  console.log("\n--- Running Stripe Reconciliation ---");
  const stripeRes = await syncStripeOrders();
  console.log("Stripe sync result:", stripeRes);

  console.log("\n--- Running Tamara Expired Check ---");
  const tamaraUpdated = await Order.updateMany(
    {
      paymentMethod: "tamara",
      paymentStatus: "pending",
      createdAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    },
    {
      $set: { paymentStatus: "failed", orderStatus: "Cancelled" }
    }
  );
  console.log("Tamara expired orders updated to Cancelled:", tamaraUpdated.modifiedCount);

  // Final Summary
  const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
  const summary = {};
  for (const ord of orders) {
    const pm = ord.paymentMethod || "unknown";
    const ps = ord.paymentStatus || "unknown";
    const os = ord.orderStatus || "unknown";
    const key = `${pm} | paymentStatus: ${ps} | orderStatus: ${os}`;
    summary[key] = (summary[key] || 0) + 1;
  }

  console.log("\n=== UPDATED ORDER STATUS SUMMARY ===");
  console.table(summary);

  await mongoose.disconnect();
}

runFullSync().catch(err => {
  console.error("Sync Error:", err);
  process.exit(1);
});
