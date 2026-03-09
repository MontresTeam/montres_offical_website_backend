const ContactForm = require("../models/contactModal");
const sendEmail = require("../utils/sendEmail");

// 📩 Submit Contact Form
exports.submitContactForm = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      country,
      companyName,
      subject,
      message,
    } = req.body;

    // ✅ Optional attachment handling
    let attachmentUrl = "";

    // Case 1: Cloudinary upload (images array)
    if (req.body.images && Array.isArray(req.body.images)) {
      if (req.body.images.length > 0) {
        attachmentUrl = req.body.images[0].url;
      }
    }

    // Case 2: Single uploaded file (multer / cloudinary)
    if (req.file && req.file.path) {
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
      attachment: attachmentUrl, // ← empty string if not uploaded
    });

    await newContact.save();

    // 📩 Send Email Notification to Admin & Sales
    const adminEmails = ["admin@montres.ae", "sales@montres.ae"];
    const emailSubject = `New Contact Inquiry: ${subject || "No Subject"}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #000; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Montres Trading L.L.C – The Art Of Time</h2>
        <p><strong>New Inquiry Received from Website</strong></p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 5px; font-weight: bold; width: 120px;">Name:</td><td style="padding: 5px;">${fullName}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Email:</td><td style="padding: 5px;">${email}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Phone:</td><td style="padding: 5px;">${phone || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Country:</td><td style="padding: 5px;">${country || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Company:</td><td style="padding: 5px;">${companyName || "N/A"}</td></tr>
          <tr><td style="padding: 5px; font-weight: bold;">Subject:</td><td style="padding: 5px;">${subject || "N/A"}</td></tr>
        </table>

        <p><strong>Message:</strong></p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #eee;">
          ${message}
        </div>

        ${attachmentUrl ? `<p style="margin-top: 20px;"><strong>Attachment:</strong> <a href="${attachmentUrl}">View File</a></p>` : ""}
        
        <footer style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
          <p>Sent from Montres Store (www.montres.ae)</p>
        </footer>
    `;
    const textContent = `New Contact Inquiry from: ${fullName}\nEmail: ${email}\nPhone: ${phone || "N/A"}\nCountry: ${country || "N/A"}\nCompany: ${companyName || "N/A"}\nSubject: ${subject || "N/A"}\n\nMessage:\n${message}`;

    // Send to both emails (parallel)
    await Promise.all(
      adminEmails.map((toEmail) => sendEmail(toEmail, emailSubject, htmlContent, textContent))
    );

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




// 📜 Get all contact form submissions (admin use)
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

// 🗑 Delete contact form (admin)
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
// 📜 Get single contact submission
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
