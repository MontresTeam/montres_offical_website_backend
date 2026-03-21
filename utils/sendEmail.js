const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, htmlContent, textContent = "") => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });

        // Add error listener to prevent app crashes on unhandled connection errors
        transporter.on('error', (err) => {
            console.error('Nodemailer SendEmail Transporter Error:', err);
        });

        // Strip HTML tags for a clean text version if not provided
        const plainText = textContent || htmlContent.replace(/<[^>]*>?/gm, '');

        await transporter.sendMail({
            from: `"Montres Admin" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text: plainText,
            html: htmlContent,
            headers: {
                "X-Priority": "1 (Highest)",
                "X-MSMail-Priority": "High",
                "Importance": "High",
            }
        });

        console.log("✅ Email sent successfully to:", to);
    } catch (error) {
        console.error("❌ Failed to send email:", error);
    }
};

module.exports = sendEmail;
