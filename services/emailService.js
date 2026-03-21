const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true, // Use pooling for better connection management
  maxConnections: 5,
  maxMessages: 100,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password, not your Gmail password
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 30000, // 30 seconds
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email Service Error during verification:", error.message);
    if (error.message.includes("535")) {
      console.error("💡 TIP: This is likely a 'Bad Credentials' error. Please ensure you are using a 'Gmail App Password', not your regular Gmail password.");
    }
  } else {
    console.log("✅ Email service is ready to take our messages");
  }
});

// Handle transporter errors to prevent app crashes on connection reset
transporter.on('error', (err) => {
  console.error('Nodemailer Transporter Error:', err);
});

// Welcome email function
const sendWelcomeEmail = async (email, name) => {
  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🎉 Welcome to Montres — Your Account is Ready!",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Montres</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container {
              width: 100% !important;
              padding: 20px !important;
            }
            .header {
              padding: 20px 10px !important;
            }
            .content {
              padding: 20px 15px !important;
            }
            .btn {
              display: block !important;
              width: 90% !important;
              margin: 0 auto !important;
              text-align: center !important;
            }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f7f7f7;">
        
        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f7;">
          <tr>
            <td align="center">
              <!-- Email Container -->
              <table class="container" width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
                
                <!-- Header -->
                <tr>
                  <td class="header" style="background-color: #1a1a1a; padding: 40px; text-align: center;">
                    <h1 style="color: #c5a059; margin: 0; font-size: 24px; letter-spacing: 4px; font-weight: 700;">MONTRES</h1>
                    <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 15px auto;"></div>
                    <p style="color: #ffffff; margin: 5px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8;">Welcome to the Community</p>
                  </td>
                </tr>
                
                <!-- Content Section -->
                <tr>
                  <td class="content" style="padding:40px 30px;">
                    
                    <!-- Greeting -->
                    <table width="100%">
                      <tr>
                        <td>
                          <h2 style="color:#333333;font-size:22px;font-weight:600;margin:0 0 20px;">Hello ${name},</h2>
                          <p style="color:#666666;font-size:16px;line-height:1.6;margin:0 0 20px;">
                            Thank you for creating an account with <strong style="color:#667eea;">Montres</strong>. 
                            We're thrilled to have you join our community of watch enthusiasts!
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Benefits List -->
                    <table width="100%" style="margin:30px 0;">
                      <tr>
                        <td>
                          <table width="100%">
                            <tr>
                              <td width="40" style="vertical-align:top;">
                                <div style="background-color:#f0f4ff;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                  <span style="color:#667eea;">✓</span>
                                </div>
                              </td>
                              <td style="padding-left:15px;">
                                <p style="color:#333333;font-size:15px;margin:0 0 10px;font-weight:500;">Browse Premium Watches</p>
                                <p style="color:#666666;font-size:14px;margin:0;line-height:1.5;">Discover our curated collection of luxury and classic timepieces</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height:20px;"></td></tr>
                      <tr>
                        <td>
                          <table width="100%">
                            <tr>
                              <td width="40" style="vertical-align:top;">
                                <div style="background-color:#f0f4ff;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                  <span style="color:#667eea;">✓</span>
                                </div>
                              </td>
                              <td style="padding-left:15px;">
                                <p style="color:#333333;font-size:15px;margin:0 0 10px;font-weight:500;">Manage Orders Easily</p>
                                <p style="color:#666666;font-size:14px;margin:0;line-height:1.5;">Track shipments and view order history in your account</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height:20px;"></td></tr>
                      <tr>
                        <td>
                          <table width="100%">
                            <tr>
                              <td width="40" style="vertical-align:top;">
                                <div style="background-color:#f0f4ff;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                  <span style="color:#667eea;">✓</span>
                                </div>
                              </td>
                              <td style="padding-left:15px;">
                                <p style="color:#333333;font-size:15px;margin:0 0 10px;font-weight:500;">Exclusive Offers</p>
                                <p style="color:#666666;font-size:14px;margin:0;line-height:1.5;">Be the first to know about new arrivals and special promotions</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table width="100%" style="margin:40px 0 30px;">
                      <tr>
                        <td align="center">
                          <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/login" 
                             class="btn" 
                             style="display:inline-block;background-color: #1a1a1a;color:#ffffff;text-decoration:none;padding:18px 45px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;box-shadow:0 10px 20px rgba(0,0,0,0.1);">
                            ACCESS YOUR ACCOUNT
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Help Text -->
                    <table width="100%">
                      <tr>
                        <td style="padding:20px 0;border-top:1px solid #eeeeee;">
                          <p style="color:#999999;font-size:14px;line-height:1.6;margin:0;text-align:center;">
                            If you did not create this account, please ignore this email.<br>
                            Need help? Contact us at <a href="mailto:support@montres.com" style="color:#667eea;text-decoration:none;">support@montres.com</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color:#f9f9f9;padding:30px;text-align:center;">
                    <p style="color:#888888;font-size:14px;margin:0 0 15px;">
                      Montres Store &copy; ${new Date().getFullYear()}
                    </p>
                    <p style="color:#aaaaaa;font-size:12px;margin:0;line-height:1.5;">
                      123 Luxury Lane, Watch District<br>
                      Geneva, Switzerland
                    </p>
                  </td>
                </tr>
                
              </table>
              
              <!-- Bottom Spacing -->
              <table width="100%" style="margin:30px 0;">
                <tr>
                  <td style="text-align:center;">
                    <p style="color:#aaaaaa;font-size:12px;margin:0;">
                      You received this email because you signed up for Montres.<br>
                      <a href="#" style="color:#999999;text-decoration:underline;">Unsubscribe</a> | 
                      <a href="#" style="color:#999999;text-decoration:underline;">Privacy Policy</a> | 
                      <a href="#" style="color:#999999;text-decoration:underline;">Terms of Service</a>
                    </p>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
        </table>
        
      </body>
      </html>
    `,
  };

  try {
    // FIX: Changed from mailTransporter to transporter
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

// Manual offer email function
const sendManualOfferEmail = async (offerData, offerLink) => {
  console.log(offerLink, "offerLink");

  const { customerName, customerEmail, productName, offeredPrice, originalPrice, expiresAt } = offerData;
  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A';

  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: `🎁 Exclusive Private Offer: ${productName}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Special Offer from Montres</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; padding: 10px !important; }
            .header { padding: 30px 15px !important; }
            .content { padding: 30px 20px !important; }
            .price-card { padding: 20px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f7f9;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f9;padding: 20px 0;">
          <tr>
            <td align="center">
              <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
                
                <!-- Header -->
                <tr>
                  <td class="header" style="background-color: #1a1a1a; padding: 50px 40px; text-align: center;">
                    <h1 style="color: #c5a059; margin: 0; font-size: 24px; letter-spacing: 4px; font-weight: 700;">MONTRES</h1>
                    <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 15px auto;"></div>
                    <p style="color: #ffffff; margin: 5px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; opacity: 0.8;">Exclusive Private Invitation</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td class="content" style="padding:50px 40px;">
                    <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 20px;">Hello ${customerName},</h2>
                    <p style="color:#555555;font-size:16px;line-height:1.7;margin:0 0 30px;">
                      We are pleased to offer you a special, time-limited price for the <strong>${productName}</strong>. 
                      This offer has been specially prepared for you and is available only through the link below.
                    </p>
                    
                    <!-- Price Card -->
                    <div class="price-card" style="background-color:#fafafa;border:1px solid #eeeeee;border-radius:12px;padding:35px;text-align:center;margin-bottom:40px;">
                      <div style="color:#888888;font-size:14px;text-decoration:line-through;margin-bottom:8px;">Original Price: AED ${originalPrice.toLocaleString()}</div>
                      <div style="color:#1a1a1a;font-size:18px;margin-bottom:5px;font-weight:500;">Yours for:</div>
                      <div style="color:#c5a059;font-size:42px;font-weight:800;margin-bottom:10px;">AED ${offeredPrice.toLocaleString()}</div>
                      <div style="display:inline-block;padding:6px 15px;background-color:#e6f4ea;color:#1e7e34;border-radius:20px;font-size:13px;font-weight:600;">
                        Save ${(100 - (offeredPrice / originalPrice * 100)).toFixed(0)}% Instantly
                      </div>
                    </div>
                    
                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${offerLink}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;text-decoration:none;padding:20px 45px;border-radius:8px;font-weight:700;font-size:16px;letter-spacing:1px;box-shadow:0 15px 35px rgba(0,0,0,0.15);">
                            CLAIM THIS OFFER
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Expiry Info -->
                    <div style="text-align:center;margin-top:35px;">
                      <p style="color:#999999;font-size:13px;margin:0;">
                        * This offer is valid until <strong>${expiryDate}</strong>
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Security Note -->
                <tr>
                  <td style="padding:0 40px 40px;">
                    <div style="background-color:#f9f9f9;border-radius:8px;padding:20px;display:flex;align-items:center;">
                      <div style="color:#555555;font-size:13px;line-height:1.5;">
                        <strong>Security Note:</strong> This is a secure personal link and should not be shared. 
                        It will automatically expire after use or on the date specified above.
                      </div>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color:#1a1a1a;padding:40px;text-align:center;color:#888888;">
                    <div style="font-size:18px;color:#ffffff;margin-bottom:10px;font-weight:600;">MONTRES</div>
                    <div style="font-size:12px;margin-bottom:20px;letter-spacing:1px;">LUXURY TIMEPIECES</div>
                    <p style="font-size:13px;margin:0;line-height:1.6;">
                      &copy; ${new Date().getFullYear()} Montres Store. All rights reserved.<br>
                      123 Luxury Lane, Watch District, Geneva, Switzerland
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Manual offer email sent to ${customerEmail}`);
    return { success: true, message: 'Offer email sent successfully' };
  } catch (error) {
    console.error('Error sending offer email:', error);
    throw error;
  }
};

// --- Offer Related Emails ---

const formatCurrency = (amount) => `AED ${amount.toLocaleString()}`;

/**
 * Unified Luxury Wrapper for Customer Emails
 */
const luxuryEmailWrapper = (content, title, accentColor = "#c5a358") => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; border-radius: 0 !important; }
      .content { padding: 40px 20px !important; }
      .cta-btn { width: 100% !important; text-align: center !important; padding: 22px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 60px 0;">
    <tr>
      <td align="center">
        <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #f2f2f2; overflow: hidden;">
          
          <!-- Luxury Header -->
          <tr>
            <td style="padding: 60px 40px 40px; text-align: center;">
              <h1 style="color: #1a1a1a; margin: 0; font-size: 24px; letter-spacing: 5px; font-weight: 300; text-transform: uppercase;">MONTRES</h1>
              <div style="width: 30px; height: 1px; background-color: ${accentColor}; margin: 20px auto;"></div>
              <p style="color: ${accentColor}; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">${title}</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td class="content" style="padding: 0 60px 60px;">
              ${content}
            </td>
          </tr>

          <!-- Minimal Footer -->
          <tr>
            <td style="padding: 0 60px 40px; text-align: center; border-top: 1px solid #f8f8f8; padding-top: 30px;">
              <p style="color: #bbbbbb; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin: 0;">
                &copy; ${new Date().getFullYear()} MONTRES LUXURY MARKETPLACE &bull; ALL RIGHTS RESERVED
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// 1. Offer Submitted Confirmation
const sendOfferConfirmationEmail = async (offerData) => {
  const { customerEmail, customerName, productName, offerPrice, originalPrice, token } = offerData;
  const websiteUrl = process.env.CLIENT_URL || "https://www.montres.ae";
  const offerLink = `${websiteUrl}/offer/${token}`;

  const content = `
    <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 25px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Hello ${customerName},</h2>
    
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0 0 40px; text-align: center; font-weight: 300;">
      Your offer has been sent to the seller for the <strong>${productName}</strong>. They will review it and respond shortly.
    </p>

    <!-- Pricing Summary -->
    <table width="100%" style="border-top: 1px solid #f8f8f8; border-bottom: 1px solid #f8f8f8; margin-bottom: 40px;">
      <tr>
        <td style="padding: 25px 0; text-align: left;">
          <span style="display: block; color: #999999; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Listed Price</span>
          <span style="color: #333333; font-size: 16px; font-weight: 400;">${formatCurrency(originalPrice)}</span>
        </td>
        <td style="padding: 25px 0; text-align: right;">
          <span style="display: block; color: #c5a358; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Your Offer</span>
          <span style="color: #c5a358; font-size: 16px; font-weight: 600;">${formatCurrency(offerPrice)}</span>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-bottom: 20px;">
        <p style="color: #999999; font-size: 11px; margin: 0 0 35px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 300;">
            Seller will respond within 24 hours.
        </p>
        <a href="${offerLink}" class="cta-btn" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 22px 50px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px;">VIEW OFFER STATUS</a>
    </div>
  `;

  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: "Your Offer Has Been Submitted",
    html: luxuryEmailWrapper(content, "Offer Submitted Successfully")
  };

  return transporter.sendMail(mailOptions);
};

// 2. Offer Status Update / Transitions (Accepted, Rejected, Countered)
const sendOfferStatusUpdateEmail = async (offerData, status, extra = null) => {
  const { customerEmail, customerName, productName, token, offerPrice, counterPrice, originalPrice } = offerData;
  const websiteUrl = process.env.CLIENT_URL || "https://www.montres.ae";
  const offerLink = `${websiteUrl}/offer/${token}`;

  let title = "Offer Update";
  let accentColor = "#c5a358";
  let content = "";
  let subject = `Offer Update: ${productName}`;

  if (status === 'accepted') {
    accentColor = "#10b981";
    title = "Offer Accepted";
    subject = "Your Offer Has Been Accepted 🎉";
    const finalPrice = counterPrice || offerPrice || extra;

    content = `
      <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 25px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">GREAT NEWS!</h2>
      
      <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0 0 40px; text-align: center; font-weight: 300;">
        Great news! Your offer has been accepted for the <strong>${productName}</strong>.
      </p>

      <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 4px; padding: 30px; text-align: center; margin-bottom: 40px;">
          <p style="color: #1a1a1a; font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 700; margin-bottom: 10px;">Final Price</p>
          <p style="color: #1a1a1a; font-size: 32px; font-weight: 600; margin: 0;">${formatCurrency(finalPrice)}</p>
      </div>

      <div style="text-align: center;">
          <a href="${offerLink}" class="cta-btn" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 22px 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">SECURE CHECKOUT</a>
      </div>
    `;
  } else if (status === 'rejected') {
    accentColor = "#ef4444";
    title = "Offer Not Accepted";
    subject = "Your Offer Was Not Accepted";

    content = `
      <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 25px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Hello ${customerName},</h2>
      
      <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0 0 30px; text-align: center; font-weight: 300;">
        The seller did not accept your offer for the <strong>${productName}</strong>.
      </p>

      <div style="background-color: #fffafb; border: 1px solid #fee2e2; padding: 25px; text-align: center; margin-bottom: 40px;">
          <p style="color: #ef4444; font-size: 12px; margin: 0; font-weight: 500; letter-spacing: 0.5px;">
            Try a higher offer to increase chances.
          </p>
      </div>

      <div style="text-align: center;">
          <a href="${websiteUrl}/WatchDetailPage/${offerData.product?._id || offerData.product}" class="cta-btn" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 22px 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px;">MAKE NEW OFFER</a>
      </div>
    `;
  } else if (status === 'countered') {
    title = "Counter Offer Received";
    subject = "Seller Sent You a Counter Offer";
    const cPrice = extra || counterPrice;

    content = `
      <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 25px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Hello ${customerName},</h2>
      
      <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0 0 40px; text-align: center; font-weight: 300;">
        The seller has provided a counter offer for your review.
      </p>

      <table width="100%" style="border-top: 1px solid #f8f8f8; border-bottom: 1px solid #f8f8f8; margin-bottom: 40px;">
        <tr>
          <td style="padding: 25px 0; text-align: left;">
            <span style="display: block; color: #999999; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Your Offer</span>
            <span style="color: #333333; font-size: 16px; font-weight: 400;">${formatCurrency(offerPrice)}</span>
          </td>
          <td style="padding: 25px 0; text-align: right;">
            <span style="display: block; color: #c5a358; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px;">Seller Counter Offer</span>
            <span style="color: #c5a358; font-size: 20px; font-weight: 700;">${formatCurrency(cPrice)}</span>
          </td>
        </tr>
      </table>

      <div style="text-align: center;">
          <a href="${offerLink}" class="cta-btn" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 22px 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px;">VIEW OFFER</a>
      </div>
    `;
  }

  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: subject,
    html: luxuryEmailWrapper(content, title, accentColor)
  };

  return transporter.sendMail(mailOptions);
};

// 4. Counter Offer received Alert
const sendCounterOfferEmail = async (offerData, counterPrice, expirationHours) => {
  return sendOfferStatusUpdateEmail(offerData, 'countered', counterPrice);
};


// 5. Offer Alerts (To Admin)
const sendAdminOfferNotification = async (offerData) => {
  const { productName, customerName, customerEmail, offerPrice, originalPrice, status, orderId } = offerData;
  const targetEmail = process.env.ADMIN_EMAIL || 'admin@montres.ae';
  const adminUrl = process.env.ADMIN_URL || '#';

  let subject = `🚨 New Offer: ${customerName}`;
  let title = "New Offer Received";
  let accentColor = "#1a1a1a";
  let content = "";
  let badgeText = "Pending Review";

  if (status === "COUNTER_OFFER_ACCEPTED") {
    subject = `Customer Accepted Your Counter Offer 🎉`;
    title = "Offer Confirmed";
    badgeText = "COUNTER ACCEPTED";
    accentColor = "#10b981";
    content = `
      <div style="text-align: center; margin-bottom: 30px;">
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">Good news! The customer has accepted your counter offer.</p>
        <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; padding: 25px; border-radius: 4px;">
           <p style="color: #15803d; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">Final Agreed Price</p>
           <p style="color: #15803d; font-size: 24px; font-weight: 700; margin: 0;">${formatCurrency(offerPrice)}</p>
        </div>
      </div>
      <p style="color: #555; font-size: 13px; text-align: center; margin-bottom: 30px;">You can now proceed with order processing.</p>
      <div style="text-align: center;">
          <a href="${adminUrl}/admin/orders/${orderId || ''}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 18px 35px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; border-radius: 2px;">VIEW ORDER DETAILS</a>
      </div>
    `;
  } else if (status === "COUNTER_OFFER_REJECTED") {
    subject = `Customer Rejected Your Counter Offer`;
    title = "Counter Offer Rejected";
    accentColor = "#ef4444";
    badgeText = "COUNTER REJECTED";
    content = `
      <div style="text-align: center; margin-bottom: 30px;">
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">The customer has declined your counter offer.</p>
        <div style="background-color: #fffafb; border: 1px solid #fee2e2; padding: 25px; border-radius: 4px;">
           <p style="color: #ef4444; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">Your Rejected Counter</p>
           <p style="color: #ef4444; font-size: 24px; font-weight: 700; margin: 0;">${formatCurrency(offerPrice)}</p>
        </div>
      </div>
      <p style="color: #555; font-size: 13px; text-align: center; margin-bottom: 30px;">You may send a new counter offer or wait for a new offer.</p>
      <div style="text-align: center;">
          <a href="${adminUrl}/offers" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 18px 35px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; border-radius: 2px;">VIEW OFFER</a>
      </div>
    `;
  } else {
    // Default: New Offer Submitted
    const discount = (((originalPrice - offerPrice) / originalPrice) * 100).toFixed(0);
    content = `
      <div style="margin-bottom: 30px;">
        <table width="100%" style="border-collapse: collapse; margin-bottom: 30px;">
          <tr>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Product</td>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #1a1a1a; font-weight: 600; text-align: right;">${productName}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Customer</td>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #1a1a1a; text-align: right;">${customerName} (${customerEmail})</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Bid Amount</td>
            <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; color: #1a1a1a; font-weight: 700; font-size: 18px; text-align: right;">${formatCurrency(offerPrice)}</td>
          </tr>
          <tr>
            <td style="padding: 15px 0; color: #64748b; font-size: 13px;">Discount</td>
            <td style="padding: 15px 0; color: #ef4444; font-weight: 700; text-align: right;">-${discount}% off List</td>
          </tr>
        </table>
        <div style="text-align: center;">
            <a href="${adminUrl}/offers" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 18px 35px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; border-radius: 2px;">MANAGE IN DASHBOARD</a>
        </div>
      </div>
    `;
  }

  const html = luxuryEmailWrapper(title, content, accentColor, badgeText);

  const mailOptions = {
    from: `"Montres Boutique" <${process.env.EMAIL_USER}>`,
    to: targetEmail,
    subject: subject,
    html: html
  };

  return transporter.sendMail(mailOptions);
};


// 6. Order Confirmation (To Customer)
const sendOrderConfirmationEmail = async (order) => {
  const { shippingAddress, items, total, subtotal, shippingFee, currency, _id } = order;

  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center;">
          <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; margin-right: 12px;">
          <div>
            <p style="margin: 0; font-weight: 600; color: #333;">${item.name}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Qty: ${item.quantity}</p>
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #333;">
        ${currency} ${(item.price * item.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: shippingAddress.email,
    subject: `✅ Order Confirmed: #${_id.toString().slice(-6).toUpperCase()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; border-radius: 0 !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
          <tr>
            <td align="center">
              <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <tr>
                  <td style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); padding: 40px; text-align: center;">
                    <h1 style="color: #d4af37; margin: 0; font-size: 28px; letter-spacing: 2px;">MONTRES</h1>
                    <p style="color: #ffffff; margin: 10px 0 0; font-size: 14px; opacity: 0.8; text-transform: uppercase; letter-spacing: 3px;">Order Confirmation</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="color: #333; margin: 0 0 20px;">Thank you for your order!</h2>
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                      Hi ${shippingAddress.firstName}, we've received your order and are getting it ready for shipment. 
                      You'll receive another email with tracking information once your package is on its way.
                    </p>
                    
                    <div style="margin: 30px 0; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fafafa;">
                      <p style="margin: 0 0 10px; font-size: 13px; color: #999; text-transform: uppercase;">Order Number</p>
                      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #333;">#${_id.toString().toUpperCase()}</p>
                    </div>

                    <h3 style="color: #333; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px; margin-top: 40px;">Order Summary</h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${itemsHTML}
                      <tr>
                        <td style="padding: 20px 12px 5px; text-align: right; color: #666;">Subtotal</td>
                        <td style="padding: 20px 12px 5px; text-align: right; color: #333;">${currency} ${subtotal.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 12px; text-align: right; color: #666;">Shipping</td>
                        <td style="padding: 5px 12px; text-align: right; color: #333;">${currency} ${shippingFee.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 12px; text-align: right; font-size: 18px; font-weight: 700; color: #333;">Total</td>
                        <td style="padding: 15px 12px; text-align: right; font-size: 18px; font-weight: 700; color: #d4af37;">${currency} ${total.toLocaleString()}</td>
                      </tr>
                    </table>

                    <h3 style="color: #333; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px; margin-top: 40px;">Shipping Address</h3>
                    <p style="color: #666; font-size: 15px; line-height: 1.6; margin: 15px 0 0;">
                      ${shippingAddress.firstName} ${shippingAddress.lastName}<br>
                      ${shippingAddress.address1}${shippingAddress.address2 ? ', ' + shippingAddress.address2 : ''}<br>
                      ${shippingAddress.city}, ${shippingAddress.country}<br>
                      Phone: ${shippingAddress.phone}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9f9f9; padding: 30px; text-align: center; border-top: 1px solid #eee;">
                    <p style="color: #888; font-size: 14px; margin: 0;">Questions? Contact us at support@montres.ae</p>
                  </td>
                </tr>
              </table>
              <p style="color: #aaa; font-size: 12px; margin-top: 20px;">
                &copy; ${new Date().getFullYear()} Montres Store. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

// 7. Restock Notification (To Customer)
const sendRestockNotification = async (email, productName, productUrl, productThumbnail) => {
  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `✨ Back in Stock: ${productName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                <tr>
                  <td style="padding: 50px 40px; text-align: center;">
                    <div style="display: inline-block; padding: 10px 20px; background-color: #f0fdf4; color: #16a34a; border-radius: 30px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px;">
                      It's Back!
                    </div>
                    <h1 style="color: #1a1a1a; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -1px;">Back in Stock</h1>
                    <p style="color: #64748b; font-size: 18px; line-height: 1.6; margin: 15px 0 40px;">
                      Good news! The <strong>${productName}</strong> you were looking for is now available again. 
                      Act fast, as stock is limited!
                    </p>
                    
                    ${productThumbnail ? `
                      <div style="margin-bottom: 40px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <img src="${productThumbnail}" alt="${productName}" style="width: 100%; max-width: 300px; height: auto; border-radius: 8px;">
                      </div>
                    ` : ''}

                    <a href="${productUrl}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 20px 45px; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
                      SHOP NOW
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #1a1a1a; padding: 40px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 10px;">You're receiving this because you signed up for restock alerts.</p>
                    <p style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 2px;">MONTRES</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

// 8. Offer Expired (To Customer)
const sendOfferExpiredEmail = async (offerData) => {
  const { customerEmail, customerName, productName } = offerData;
  const websiteUrl = process.env.CLIENT_URL || "https://www.montres.ae";

  const content = `
    <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 500; margin: 0 0 25px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Hello ${customerName},</h2>
    
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0 0 40px; text-align: center; font-weight: 300;">
      Your offer has expired without response for the <strong>${productName}</strong>.
    </p>

    <div style="text-align: center;">
        <a href="${websiteUrl}/WatchDetailPage/${offerData.product?._id || offerData.product}" class="cta-btn" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 22px 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px;">SUBMIT NEW OFFER</a>
    </div>
  `;

  const mailOptions = {
    from: `"Montres Store" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: "Your Offer Has Expired",
    html: luxuryEmailWrapper(content, "Offer Expired", "#94a3b8")
  };

  return transporter.sendMail(mailOptions);
};


// For CommonJS export
module.exports = {
  transporter,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendRestockNotification,
  sendOfferConfirmationEmail,
  sendOfferStatusUpdateEmail,
  sendCounterOfferEmail,
  sendAdminOfferNotification,
  sendManualOfferEmail,
  sendOfferExpiredEmail
};
