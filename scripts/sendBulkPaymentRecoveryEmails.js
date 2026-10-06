const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Order = require('../models/OrderModel');
const Product = require('../models/product');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

function generateEmailHtml({ customerName, items, orderNumber, total, currency, checkoutUrl, productUrl }) {
  const clientUrl = process.env.CLIENT_URL || 'https://www.montres.ae';
  const displayCurrency = currency || 'AED';
  const displayTotal = Number(total || 0).toLocaleString();

  const itemsHtml = items.map(item => {
    const itemUrl = item.productSlug 
      ? `${clientUrl}/WatchDetailPage/${item.productSlug}` 
      : (item.productId ? `${clientUrl}/WatchDetailPage/${item.productId}` : `${clientUrl}/shop`);

    return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #27272a;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${item.image ? `
                <td width="70" style="vertical-align: middle; padding-right: 14px;">
                  <img src="${item.image}" alt="${item.name}" width="64" height="64" style="border-radius: 8px; object-fit: cover; border: 1px solid #3f3f46; display: block;" />
                </td>
              ` : ''}
              <td style="vertical-align: middle;">
                <div style="font-weight: 700; font-size: 15px; color: #ffffff; line-height: 1.4;">${item.name}</div>
                ${item.sku ? `<div style="font-size: 12px; color: #a1a1aa; margin-top: 4px;">Ref / SKU: ${item.sku}</div>` : ''}
                <div style="font-size: 12px; color: #d4af37; margin-top: 6px;">
                  <a href="${itemUrl}" style="color: #d4af37; text-decoration: underline; font-weight: 600;">View Product Details &rarr;</a>
                </div>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 110px; font-weight: 700; font-size: 15px; color: #d4af37; white-space: nowrap;">
                ${displayCurrency} ${Number(item.price || 0).toLocaleString()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Order — Montres</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #09090b; padding: 30px 10px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #18181b; border-radius: 16px; overflow: hidden; border: 1px solid #27272a; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(180deg, #111113 0%, #18181b 100%); padding: 40px 30px 30px; text-align: center; border-bottom: 1px solid #27272a;">
              <div style="font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #c5a059; font-weight: 700; margin-bottom: 10px;">MONTRES TRADING L.L.C</div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Complete Your Purchase</h1>
              <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 18px auto 0;"></div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <p style="font-size: 16px; color: #ffffff; margin: 0 0 16px; font-weight: 600;">
                Dear ${customerName},
              </p>
              <p style="font-size: 14px; line-height: 1.7; color: #a1a1aa; margin: 0 0 26px;">
                We noticed that your recent checkout session for Order <strong>#${orderNumber}</strong> was interrupted or did not complete. Your selected luxury timepiece is currently held for you.
              </p>

              <!-- CTA Card -->
              <div style="background: linear-gradient(135deg, #1c1917 0%, #292524 100%); border: 1px solid #d4af37; border-radius: 12px; padding: 26px 20px; text-align: center; margin-bottom: 30px; box-shadow: 0 8px 24px rgba(212, 175, 55, 0.15);">
                <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #d4af37; font-weight: 700; margin-bottom: 6px;">Total Amount</div>
                <div style="font-size: 28px; font-weight: 800; color: #ffffff; margin-bottom: 20px;">
                  ${displayCurrency} ${displayTotal}
                </div>

                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <a href="${checkoutUrl}" style="display: inline-block; background-color: #d4af37; color: #09090b; text-decoration: none; padding: 16px 36px; border-radius: 8px; font-weight: 800; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; box-shadow: 0 6px 20px rgba(212, 175, 55, 0.35);">
                        💳 Complete Payment Now &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="font-size: 11px; color: #a8a29e; margin-top: 14px;">
                  Secure Payment Options: Visa, Mastercard, Apple Pay, Tabby &amp; Tamara (Pay in 4).
                </div>
              </div>

              <!-- Items in Order -->
              <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #e4e4e7; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #27272a;">
                Items in Your Order
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                ${itemsHtml}
              </table>

              <!-- Product Page Alternate Button -->
              ${productUrl ? `
                <div style="text-align: center; margin-bottom: 30px; padding: 16px; background-color: #27272a; border-radius: 8px;">
                  <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 10px;">Would you like to review the watch details again?</div>
                  <a href="${productUrl}" style="display: inline-block; background-color: transparent; color: #d4af37; border: 1px solid #d4af37; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                    🔍 View Product Details Page
                  </a>
                </div>
              ` : ''}

              <!-- Concierge Support -->
              <div style="border: 1px solid #27272a; border-radius: 10px; padding: 20px; background-color: #111113; text-align: center;">
                <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Need Help with Your Purchase?</div>
                <div style="font-size: 12px; color: #a1a1aa; line-height: 1.6; margin-bottom: 12px;">
                  If you are experiencing any bank card limits or payment issues, our dedicated concierge team is ready to assist with direct payment arrangements or bank transfers.
                </div>
                <a href="mailto:${process.env.ADMIN_EMAIL || 'info@montres.ae'}" style="color: #d4af37; text-decoration: none; font-weight: 600; font-size: 13px;">
                  ✉️ Contact Concierge: ${process.env.ADMIN_EMAIL || 'info@montres.ae'}
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #09090b; padding: 24px 30px; text-align: center; border-top: 1px solid #27272a;">
              <div style="font-size: 12px; font-weight: 700; color: #ffffff; letter-spacing: 2px; margin-bottom: 4px;">MONTRES</div>
              <div style="font-size: 11px; color: #71717a;">Dubai, United Arab Emirates &bull; <a href="https://www.montres.ae" style="color: #d4af37; text-decoration: none;">www.montres.ae</a></div>
              <div style="font-size: 10px; color: #52525b; margin-top: 8px;">
                &copy; ${new Date().getFullYear()} Montres Trading L.L.C. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

async function getFailedCustomersList() {
  await connectDB();
  const failedOrders = await Order.find({
    $or: [
      { paymentStatus: { $in: ['failed', 'pending'] } },
      { orderStatus: { $in: ['Cancelled', 'cancelled'] } }
    ]
  })
    .sort({ createdAt: -1 })
    .populate('items.productId')
    .lean();

  const customerMap = {};
  const clientUrl = process.env.CLIENT_URL || 'https://www.montres.ae';

  for (const order of failedOrders) {
    const email = (order.shippingAddress?.email || order.billingAddress?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;

    if (!customerMap[email]) {
      const name = ((order.shippingAddress?.firstName || '') + ' ' + (order.shippingAddress?.lastName || '')).trim() || 'Valued Collector';
      const phone = order.shippingAddress?.phone || order.billingAddress?.phone || '';
      
      const items = (order.items || []).map(item => ({
        name: item.name || 'Luxury Timepiece',
        price: item.price || order.total,
        quantity: item.quantity || 1,
        sku: item.sku || '',
        image: item.image || item.productId?.images?.[0]?.url || '',
        productId: item.productId?._id ? String(item.productId._id) : (item.productId ? String(item.productId) : ''),
        productSlug: item.productId?.slug || ''
      }));

      const firstItem = items[0];
      let productUrl = `${clientUrl}/shop`;
      if (firstItem?.productSlug) {
        productUrl = `${clientUrl}/WatchDetailPage/${firstItem.productSlug}`;
      } else if (firstItem?.productId) {
        productUrl = `${clientUrl}/WatchDetailPage/${firstItem.productId}`;
      }

      const checkoutUrl = `${clientUrl}/checkout?orderId=${order._id}&retry=true`;

      customerMap[email] = {
        orderId: order._id,
        orderNumber: order.orderNumber || String(order._id),
        customerName: name,
        email,
        phone,
        total: order.total,
        currency: order.currency || 'AED',
        items,
        checkoutUrl,
        productUrl,
        failedAttemptsCount: 1
      };
    } else {
      customerMap[email].failedAttemptsCount++;
    }
  }

  return Object.values(customerMap);
}

// Function to send test email to a single address
async function sendTestEmail(targetEmail) {
  const customers = await getFailedCustomersList();
  if (customers.length === 0) {
    throw new Error("No failed customer orders found.");
  }
  const sample = customers[0]; // Take most recent customer data
  const emailHtml = generateEmailHtml(sample);

  console.log(`Sending TEST email to: ${targetEmail}...`);
  const info = await transporter.sendMail({
    from: `"Montres Boutique" <${process.env.EMAIL_USER}>`,
    to: targetEmail,
    replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `⏰ Complete Your Order #${sample.orderNumber} — Montres`,
    html: emailHtml,
    headers: {
      "X-Entity-Ref-ID": `ORDER-REC-${sample.orderNumber}`,
      "X-Auto-Response-Suppress": "OOF, AutoReply",
    }
  });

  console.log(`✅ Test email sent successfully to ${targetEmail} (MessageId: ${info.messageId})`);
}

// Function to send live emails to all customers
async function sendLiveEmailsToAll() {
  const customers = await getFailedCustomersList();
  console.log(`Starting live bulk email delivery to ${customers.length} unique customers...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < customers.length; i++) {
    const cust = customers[i];
    try {
      const emailHtml = generateEmailHtml(cust);
      await transporter.sendMail({
        from: `"Montres Boutique" <${process.env.EMAIL_USER}>`,
        to: cust.email,
        replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        subject: `⏰ Complete Your Order #${cust.orderNumber} — Montres`,
        html: emailHtml,
        headers: {
          "X-Entity-Ref-ID": `ORDER-REC-${cust.orderNumber}`,
          "X-Auto-Response-Suppress": "OOF, AutoReply",
        }
      });

      // Update Order in DB
      await Order.findByIdAndUpdate(cust.orderId, {
        recoveryEmailSent: true,
        lastRecoveryEmailSentAt: new Date(),
        $inc: { recoveryEmailCount: 1 }
      });

      console.log(`[${i + 1}/${customers.length}] ✅ Sent recovery email to ${cust.email} (${cust.customerName})`);
      successCount++;
      // Polite delay between emails to avoid hitting Gmail rate limits
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error(`[${i + 1}/${customers.length}] ❌ Failed to send to ${cust.email}:`, err.message);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Summary: ${successCount} sent successfully, ${failCount} failed.`);
  console.log(`========================================`);
}

module.exports = {
  getFailedCustomersList,
  sendTestEmail,
  sendLiveEmailsToAll,
  generateEmailHtml
};

if (require.main === module) {
  const action = process.argv[2];
  const targetEmail = process.argv[3];

  if (action === 'test' && targetEmail) {
    sendTestEmail(targetEmail).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else if (action === 'list') {
    getFailedCustomersList().then(list => {
      console.log(`Found ${list.length} unique customers:`);
      list.forEach((c, idx) => console.log(`${idx + 1}. ${c.customerName} <${c.email}> - Order #${c.orderNumber} - ${c.total} ${c.currency} (${c.items.map(i=>i.name).join(', ')})`));
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });
  } else if (action === 'send-all') {
    sendLiveEmailsToAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else {
    console.log("Usage: node sendBulkPaymentRecoveryEmails.js [list | test <email> | send-all]");
    process.exit(0);
  }
}
