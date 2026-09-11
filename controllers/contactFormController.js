const ContactForm = require("../models/contactModal");
const sendEmail = require("../utils/sendEmail");
const validator = require("validator");

/**
 * Submit Contact Form
 */
exports.submitContactForm = async (req, res) => {
  try {
    let {
      fullName,
      email,
      phone,
      country,
      companyName,
      subject,
      message,
    } = req.body;

    if (!fullName || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Full Name, Email, and Message are required fields.",
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    fullName = validator.escape(fullName.trim());
    email = email.trim().toLowerCase();
    subject = subject ? validator.escape(subject.trim()) : "General Inquiry";
    message = validator.escape(message.trim());
    phone = phone ? validator.escape(phone.trim()) : "";
    country = country ? validator.escape(country.trim()) : "";
    companyName = companyName ? validator.escape(companyName.trim()) : "";

    let attachmentUrl = "";
    if (req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
      attachmentUrl = req.body.images[0].url;
    } else if (req.file && req.file.path) {
      attachmentUrl = req.file.path;
    }

    const newContact = new ContactForm({
      fullName,
      email,
      phone,
      country,
      companyName,
      subject,
      message,
      attachment: attachmentUrl,
    });

    await newContact.save();

    const adminEmails = [
      process.env.ADMIN_EMAIL || "farhan.dev24@gmail.com",
      process.env.SALES_EMAIL || "farhan.dev24@gmail.com"
    ];
    const emailSubject = `New Contact Inquiry: ${subject}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #000; border-bottom: 2px solid #C6A96B; padding-bottom: 10px; text-align: center;">Montres Trading L.L.C – The Art Of Time</h2>
        <p style="text-align: center; color: #666;">New Inquiry Received from Website</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fafafa; border-radius: 5px;">
          <tr><td style="padding: 10px; font-weight: bold; width: 120px; border-bottom: 1px solid #eee;">Name:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${fullName}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Email:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${email}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Phone:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${phone || "N/A"}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Country:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${country || "N/A"}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Company:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${companyName || "N/A"}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold;">Subject:</td><td style="padding: 10px;">${subject}</td></tr>
        </table>

        <p><strong>Message:</strong></p>
        <div style="background: #fff; padding: 15px; border-radius: 5px; border: 1px solid #ddd; white-space: pre-wrap;">${message}</div>

        ${attachmentUrl ? `<p style="margin-top: 20px;"><strong>Attachment:</strong> <a href="${attachmentUrl}" style="color: #C6A96B;">View File</a></p>` : ""}
        
        <footer style="margin-top: 30px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
          <p>Sent from Montres Store (www.montres.ae)</p>
          <p>© ${new Date().getFullYear()} Montres Trading L.L.C</p>
        </footer>
      </div>
    `;
    const textContent = `New Contact Inquiry from: ${fullName}\nEmail: ${email}\nPhone: ${phone || "N/A"}\nCountry: ${country || "N/A"}\nCompany: ${companyName || "N/A"}\nSubject: ${subject}\n\nMessage:\n${message}`;

    await Promise.all(
      adminEmails.map((toEmail) => sendEmail(toEmail, emailSubject, htmlContent, textContent))
    ).catch(err => console.error("Email delivery failed:", err.message));

    res.status(201).json({
      success: true,
      message: "Your inquiry has been submitted successfully!",
      data: newContact,
    });
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while submitting the form.",
      error: error.message,
    });
  }
};

// Get all contact form submissions
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await ContactForm.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact submissions.",
      error: error.message,
    });
  }
};

// Delete contact form
exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await ContactForm.findByIdAndDelete(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Contact deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting contact form entry.",
      error: error.message,
    });
  }
};

// Get single contact submission
exports.getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await ContactForm.findById(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching contact submission.",
      error: error.message,
    });
  }
};

/**
 * Reply to Contact Inquiry via Email
 */
exports.replyToContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply, message, customSubject } = req.body;
    const replyText = reply || message;

    if (!replyText || !replyText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reply message cannot be empty.",
      });
    }

    const contact = await ContactForm.findById(id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Inquiry / Ticket not found.",
      });
    }

    const emailSubject = customSubject || `Response to: ${contact.subject || 'Inquiry'} - Montres Trading`;

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: auto; border: 1px solid #eaeaea; padding: 30px; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #C6A96B; padding-bottom: 15px; margin-bottom: 25px;">
          <h2 style="color: #111; margin: 0; font-size: 22px; letter-spacing: 1.5px; text-transform: uppercase;">MONTRES TRADING L.L.C</h2>
          <p style="color: #999; font-size: 11px; margin-top: 4px; text-transform: uppercase; letter-spacing: 2px;">The Art Of Time • Dubai</p>
        </div>

        <p style="font-size: 15px; margin-bottom: 18px;">Dear <strong>${contact.fullName}</strong>,</p>

        <div style="font-size: 14px; color: #333; line-height: 1.8; white-space: pre-wrap; margin-bottom: 25px;">${replyText.trim()}</div>

        <div style="margin-top: 25px; background: #f8fafc; border-left: 4px solid #C6A96B; padding: 14px 18px; border-radius: 6px;">
          <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Your Inquiry (${new Date(contact.createdAt).toLocaleDateString()}):</p>
          <p style="margin: 0; font-size: 13px; color: #475569; font-style: italic;">"${contact.message}"</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #475569;">
          <p style="margin: 0;">Kind regards,</p>
          <p style="margin: 4px 0 0 0; font-weight: bold; color: #0f172a;">Montres Customer Support Team</p>
          <p style="margin: 2px 0 0 0; color: #94a3b8; font-size: 12px;">Dubai, United Arab Emirates • <a href="https://www.montres.ae" style="color: #C6A96B; text-decoration: none;">www.montres.ae</a></p>
        </div>

        <footer style="margin-top: 25px; font-size: 11px; color: #cbd5e1; text-align: center;">
          <p>© ${new Date().getFullYear()} Montres Trading L.L.C. All rights reserved.</p>
        </footer>
      </div>
    `;

    const textContent = `Dear ${contact.fullName},\n\n${replyText.trim()}\n\n---\nOriginal Inquiry:\n"${contact.message}"\n\nKind regards,\nMontres Customer Support Team\nwww.montres.ae`;

    // Send the email to the customer
    await sendEmail(contact.email, emailSubject, htmlContent, textContent);

    // Save reply in database history
    if (!contact.replies) {
      contact.replies = [];
    }
    contact.replies.push({
      replyMessage: replyText.trim(),
      senderEmail: req.admin?.email || process.env.EMAIL_USER || "support@montres.ae",
      senderName: req.admin?.username || "Montres Support",
      sentAt: new Date()
    });
    contact.status = "resolved";
    await contact.save();

    res.status(200).json({
      success: true,
      message: `Response email sent successfully to ${contact.email}`,
      data: contact,
    });
  } catch (error) {
    console.error("Error replying to contact inquiry:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send email response.",
      error: error.message,
    });
  }
};
