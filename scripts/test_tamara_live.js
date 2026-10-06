require("dotenv").config();
const axios = require("axios");

const TAMARA_API_BASE = process.env.TAMARA_API_BASE || "https://api.tamara.co";
const TAMARA_SECRET_KEY = process.env.TAMARA_SECRET_KEY;

const headers = {
  Authorization: `Bearer ${TAMARA_SECRET_KEY}`,
  "Content-Type": "application/json",
};

async function testVariousPayloads() {
  console.log("🔍 Testing Tamara /checkout with standard production payload formats...\n");

  const now = Date.now();

  // Test Payload A: Full standard Tamara v2 payload with shipping_amount & tax_amount objects
  const payloadA = {
    order_reference_id: `ORD-SA-${now}-A`,
    order_number: `ORD-SA-${now}-A`,
    total_amount: {
      amount: 500.0,
      currency: "SAR",
    },
    shipping_amount: {
      amount: 0.0,
      currency: "SAR",
    },
    tax_amount: {
      amount: 0.0,
      currency: "SAR",
    },
    description: "Montres Luxury Goods",
    country_code: "SA",
    payment_type: "PAY_BY_INSTALMENTS",
    instalments: 4,
    items: [
      {
        reference_id: "ITEM-101",
        type: "Physical",
        name: "Luxury Watch Accessory",
        sku: "ACC-101",
        quantity: 1,
        unit_price: {
          amount: 500.0,
          currency: "SAR",
        },
        total_amount: {
          amount: 500.0,
          currency: "SAR",
        },
      },
    ],
    consumer: {
      first_name: "Mohammed",
      last_name: "Al-Otaibi",
      phone_number: "+966555123456",
      email: "customer@montres.ae",
    },
    shipping_address: {
      first_name: "Mohammed",
      last_name: "Al-Otaibi",
      line1: "King Fahd Road",
      city: "Riyadh",
      country_code: "SA",
      phone_number: "+966555123456",
    },
    billing_address: {
      first_name: "Mohammed",
      last_name: "Al-Otaibi",
      line1: "King Fahd Road",
      city: "Riyadh",
      country_code: "SA",
      phone_number: "+966555123456",
    },
    merchant_url: {
      success: "https://www.montres.ae/checkout/verify?payment=tamara",
      cancel: "https://www.montres.ae/checkout/cancel?payment=tamara",
      failure: "https://www.montres.ae/checkout/failure?payment=tamara",
      notification: "https://api.montres.ae/api/webhook/tamara",
    },
  };

  try {
    console.log("Attempting Payload A (Standard SA / SAR with 4 installments)...");
    const resA = await axios.post(`${TAMARA_API_BASE}/checkout`, payloadA, { headers });
    console.log("🎉 SUCCESS Payload A:", JSON.stringify(resA.data, null, 2));
  } catch (err) {
    console.error("❌ Payload A Failed:", err.response?.status, err.response?.data || err.message);
  }

  // Test Payload B: UAE (AE / AED)
  const payloadB = {
    ...payloadA,
    order_reference_id: `ORD-AE-${now}-B`,
    order_number: `ORD-AE-${now}-B`,
    country_code: "AE",
    total_amount: { amount: 500.0, currency: "AED" },
    shipping_amount: { amount: 0.0, currency: "AED" },
    tax_amount: { amount: 0.0, currency: "AED" },
    items: [
      {
        reference_id: "ITEM-101",
        type: "Physical",
        name: "Luxury Watch Accessory",
        sku: "ACC-101",
        quantity: 1,
        unit_price: { amount: 500.0, currency: "AED" },
        total_amount: { amount: 500.0, currency: "AED" },
      },
    ],
    consumer: {
      first_name: "Rashid",
      last_name: "Al-Maktoum",
      phone_number: "+971501234567",
      email: "customer@montres.ae",
    },
    shipping_address: {
      first_name: "Rashid",
      last_name: "Al-Maktoum",
      line1: "Downtown Dubai",
      city: "Dubai",
      country_code: "AE",
      phone_number: "+971501234567",
    },
    billing_address: {
      first_name: "Rashid",
      last_name: "Al-Maktoum",
      line1: "Downtown Dubai",
      city: "Dubai",
      country_code: "AE",
      phone_number: "+971501234567",
    },
  };

  try {
    console.log("\nAttempting Payload B (Standard AE / AED)...");
    const resB = await axios.post(`${TAMARA_API_BASE}/checkout`, payloadB, { headers });
    console.log("🎉 SUCCESS Payload B:", JSON.stringify(resB.data, null, 2));
  } catch (err) {
    console.error("❌ Payload B Failed:", err.response?.status, err.response?.data || err.message);
  }
}

testVariousPayloads();
