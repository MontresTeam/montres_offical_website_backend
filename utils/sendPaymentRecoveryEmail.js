const Order = require("../models/OrderModel");
require("../models/product");
const sendEmail = require("./sendEmail");

/**
 * 📧 Send Luxury Payment Recovery / Retry Email
 * @param {string} orderId - MongoDB Order ID
 * @param {object} options - Optional customMessage or retryUrl
 */
const sendPaymentRecoveryEmail = async (orderId, options = {}) => {
  try {
    const order = await Order.findById(orderId).populate("items.productId");
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const customerEmail =
      order.billingAddress?.email ||
      order.shippingAddress?.email ||
      null;

    if (!customerEmail) {
      throw new Error(`No customer email found for order ${orderId}`);
    }

    const firstName =
      order.billingAddress?.firstName ||
      order.shippingAddress?.firstName ||
      "Valued Customer";

    const lastName =
      order.billingAddress?.lastName ||
      order.shippingAddress?.lastName ||
      "";

    const fullName = `${firstName} ${lastName}`.trim();

    const displayCurrency = order.settlementCurrency || order.currency || "AED";
    const displayTotal = (order.settlementTotal || order.total || 0).toFixed(2);
    const subtotal = (order.subtotal || 0).toFixed(2);
    const shippingFee = (order.shippingFee || 0).toFixed(2);

    const clientUrl = process.env.CLIENT_URL || "https://www.montres.ae";
    const retryUrl = options.retryUrl || `${clientUrl}/checkout?orderId=${order._id}&retry=true`;

    const customMessage = options.customMessage || "";

    // Items table HTML
    const itemsHtml = (order.items || []).map((item) => {
      const imageUrl = item.image || item.productId?.images?.[0]?.url || "";
      const imageCell = imageUrl
        ? `<td style="width:64px;padding:12px 14px 12px 0;vertical-align:middle;">
             <img src="${imageUrl}" alt="${item.name || 'Product'}" width="58" height="58"
                  style="display:block;border-radius:8px;border:1px solid #27272a;object-fit:cover;">
           </td>`
        : "";

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #27272a;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                ${imageCell}
                <td style="vertical-align:middle;">
                  <div style="font-weight:600;font-size:14px;color:#f4f4f5;">${item.name || "Luxury Timepiece"}</div>
                  ${item.sku ? `<div style="font-size:11px;color:#a1a1aa;margin-top:3px;">SKU: ${item.sku}</div>` : ""}
                </td>
                <td style="vertical-align:middle;text-align:center;width:40px;font-size:14px;color:#d4d4d8;">
                  Qty: ${item.quantity || 1}
                </td>
                <td style="vertical-align:middle;text-align:right;width:120px;font-size:14px;font-weight:700;color:#d4af37;white-space:nowrap;">
                  ${displayCurrency} ${(item.price || 0).toFixed(2)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join("");

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Purchase — Montres</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0"
               style="background:#18181b;border-radius:14px;border:1px solid #27272a;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.5);">

          <!-- ── Header ── -->
          <tr>
            <td style="background:#09090b;padding:36px 32px 28px;text-align:center;border-bottom:1px solid #27272a;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:4px;color:#d4af37;margin-bottom:8px;font-weight:700;">
                MONTRES TRADING L.L.C
              </div>
              <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">
                Complete Your Order
              </div>
              <div style="font-size:14px;color:#a1a1aa;margin-top:6px;">
                Your selected luxury timepiece is waiting for you
              </div>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:32px;">
              <p style="font-size:15px;color:#e4e4e7;line-height:1.7;margin:0 0 20px;">
                Dear <strong>${firstName}</strong>,
              </p>
              <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 24px;">
                We noticed that your checkout session for Order <strong>#${order.orderNumber || order._id}</strong> was not completed. Sometimes transactions are interrupted due to temporary bank OTP delays, card verification, or network timeouts.
              </p>

              ${customMessage ? `
                <div style="background:#27272a;border-left:4px solid #d4af37;border-radius:6px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#f4f4f5;">
                  ${customMessage}
                </div>
              ` : ""}

              <!-- Call to Action Banner -->
              <div style="background:linear-gradient(135deg,#1f1f23 0%,#27272a 100%);border-radius:10px;padding:24px 20px;text-align:center;margin-bottom:28px;border:1px solid #3f3f46;">
                <div style="font-size:13px;color:#a1a1aa;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">
                  Total Amount Reserved
                </div>
                <div style="font-size:26px;font-weight:800;color:#d4af37;margin-bottom:18px;">
                  ${displayCurrency} ${displayTotal}
                </div>
                <a href="${retryUrl}" target="_blank"
                   style="background:#d4af37;color:#09090b;font-weight:700;font-size:14px;letter-spacing:0.5px;padding:14px 34px;text-decoration:none;border-radius:8px;display:inline-block;box-shadow:0 4px 14px rgba(212,175,55,0.3);">
                  👉 Complete Payment &amp; Secure Item
                </a>
                <div style="font-size:12px;color:#71717a;margin-top:14px;">
                  We accept Credit/Debit Cards, Apple Pay, Tabby &amp; Tamara (Pay in 4).
                </div>
              </div>

              <!-- Order Summary -->
              <div style="font-size:14px;font-weight:700;color:#f4f4f5;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #27272a;">
                Items in Your Order
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                ${itemsHtml}
              </table>

              <!-- Totals Breakdown -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:6px 0;color:#a1a1aa;font-size:13px;">Subtotal</td>
                  <td style="padding:6px 0;text-align:right;color:#f4f4f5;font-size:13px;font-weight:600;">
                    ${displayCurrency} ${subtotal}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#a1a1aa;font-size:13px;">Shipping</td>
                  <td style="padding:6px 0;text-align:right;color:#f4f4f5;font-size:13px;font-weight:600;">
                    ${displayCurrency} ${shippingFee}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0 4px;font-size:15px;font-weight:700;color:#ffffff;border-top:1px solid #27272a;">
                    Total
                  </td>
                  <td style="padding:12px 0 4px;text-align:right;font-size:18px;font-weight:800;color:#d4af37;border-top:1px solid #27272a;">
                    ${displayCurrency} ${displayTotal}
                  </td>
                </tr>
              </table>

              <!-- Assistance Box -->
              <div style="border:1px solid #27272a;border-radius:8px;padding:18px 20px;text-align:center;background:#09090b;">
                <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:4px;">Need Assistance with Payment?</div>
                <div style="font-size:13px;color:#a1a1aa;margin-bottom:12px;">
                  Our concierge team is available to assist you with bank transfers, alternate payment links, or inquiries.
                </div>
                <a href="mailto:${process.env.SALES_EMAIL || process.env.ADMIN_EMAIL || 'sales@montres.ae'}"
                   style="color:#d4af37;text-decoration:none;font-weight:600;font-size:13px;">
                  ✉️ Email Concierge (${process.env.SALES_EMAIL || 'sales@montres.ae'})
                </a>
              </div>

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:22px 32px;background:#09090b;text-align:center;border-top:1px solid #27272a;">
              <div style="font-size:11px;color:#71717a;">
                Montres Trading L.L.C &bull; The Art of Time &bull; <a href="https://www.montres.ae" style="color:#d4af37;text-decoration:none;">www.montres.ae</a>
              </div>
              <div style="font-size:10px;color:#52525b;margin-top:6px;">
                &copy; ${new Date().getFullYear()} Montres. All rights reserved.
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

    const plainText = `Hi ${firstName},\n\nWe noticed your checkout for Order #${order.orderNumber || order._id} was not completed.\nTotal: ${displayCurrency} ${displayTotal}\n\nYou can complete your payment securely at:\n${retryUrl}\n\nNeed assistance? Contact our concierge at ${process.env.SALES_EMAIL || 'sales@montres.ae'}\n\nMontres Trading L.L.C`;

    await sendEmail(
      customerEmail,
      `⏰ Complete Your Order #${order.orderNumber || order._id} — Montres`,
      emailHtml,
      plainText
    );

    // Update Order Model recovery tracking
    order.recoveryEmailSent = true;
    order.lastRecoveryEmailSentAt = new Date();
    order.recoveryEmailCount = (order.recoveryEmailCount || 0) + 1;
    await order.save();

    console.log(`✅ Payment recovery email sent successfully to ${customerEmail} for order ${order._id}`);
    return { success: true, customerEmail, order };
  } catch (err) {
    console.error(`❌ Failed to send payment recovery email for order ${orderId}:`, err.message);
    throw err;
  }
};

module.exports = sendPaymentRecoveryEmail;
