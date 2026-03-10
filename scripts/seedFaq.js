const mongoose = require('mongoose');
const FaqBot = require('../models/FaqBot');
const dotenv = require('dotenv');
dotenv.config();

const faqs = [
    // ─── MAIN MENU ────────────────────────────────────────────────────────────
    {
        trigger: "main_menu",
        response: "Hello 👋 Welcome to Montres.\nHow can we help you today?",
        options: [
            { label: "🛒 Buy a Watch", trigger: "buy_watch" },
            { label: "💰 Sell a Watch", trigger: "sell_watch" },
            { label: "🔧 Watch Service & Repair", trigger: "service_repair" },
            { label: "📍 Visit Our Store", trigger: "store_visit" },
            { label: "🚚 Shipping & Delivery", trigger: "shipping" },
            { label: "🔍 Authentication", trigger: "authenticity" },
            { label: "❓ Other Questions", trigger: "other_questions" }
        ],
        category: "System"
    },

    // ─── BUYING A WATCH ───────────────────────────────────────────────────────
    {
        trigger: "buy_watch",
        response: "We'd love to help you find your perfect watch! What would you like to know?",
        options: [
            { label: "How can I buy a watch?", trigger: "how_to_buy" },
            { label: "Is this watch available?", trigger: "availability" },
            { label: "Can I reserve a watch?", trigger: "reserve_watch" },
            { label: "Can I see more photos or videos?", trigger: "more_photos" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Sales"
    },
    {
        trigger: "how_to_buy",
        response: "You can purchase directly through our website or contact us for assistance. If you prefer, you are also welcome to visit our store in Dubai to see the watch in person.",
        options: [
            { label: "What payment methods do you accept?", trigger: "payment_methods" },
            { label: "⬅️ Back to Buying", trigger: "buy_watch" }
        ],
        category: "Sales"
    },
    {
        trigger: "availability",
        response: "Most watches listed on our website are available. However, due to high demand, some pieces may sell quickly. Please contact us to confirm availability.",
        options: [
            { label: "Can I reserve it?", trigger: "reserve_watch" },
            { label: "⬅️ Back to Buying", trigger: "buy_watch" }
        ],
        category: "Sales"
    },
    {
        trigger: "reserve_watch",
        response: "Yes, in some cases we can reserve a watch for a short period. Please contact us directly to arrange a reservation.",
        options: [
            { label: "⬅️ Back to Buying", trigger: "buy_watch" }
        ],
        category: "Sales"
    },
    {
        trigger: "more_photos",
        response: "Yes. We can provide additional photos or videos of the watch upon request to help you inspect the condition and details.",
        options: [
            { label: "⬅️ Back to Buying", trigger: "buy_watch" }
        ],
        category: "Sales"
    },

    // ─── AUTHENTICITY ─────────────────────────────────────────────────────────
    {
        trigger: "authenticity",
        response: "Montres takes authenticity very seriously. What would you like to know?",
        options: [
            { label: "Are your watches authentic?", trigger: "are_watches_authentic" },
            { label: "How do you verify authenticity?", trigger: "verify_authenticity" },
            { label: "Do watches come with box & papers?", trigger: "box_and_papers" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Authenticity"
    },
    {
        trigger: "are_watches_authentic",
        response: "Yes. All watches sold by Montres are carefully inspected by our experienced technician and guaranteed to be authentic.",
        options: [
            { label: "How do you verify this?", trigger: "verify_authenticity" },
            { label: "⬅️ Back", trigger: "authenticity" }
        ],
        category: "Authenticity"
    },
    {
        trigger: "verify_authenticity",
        response: "Each watch is inspected for movement, case, dial, serial numbers, and overall condition to ensure authenticity before being offered for sale.",
        options: [
            { label: "⬅️ Back", trigger: "authenticity" }
        ],
        category: "Authenticity"
    },
    {
        trigger: "box_and_papers",
        response: "Some watches include the original box and papers. This information is always mentioned in the product description.",
        options: [
            { label: "⬅️ Back", trigger: "authenticity" }
        ],
        category: "Authenticity"
    },

    // ─── WATCH CONDITION ──────────────────────────────────────────────────────
    {
        trigger: "watch_condition",
        response: "We're very transparent about watch conditions. What would you like to know?",
        options: [
            { label: "Are the watches new or pre-owned?", trigger: "new_or_preowned" },
            { label: "Has the watch been serviced?", trigger: "watch_serviced" },
            { label: "Has the watch been polished?", trigger: "watch_polished" },
            { label: "Are there any scratches or damage?", trigger: "watch_scratches" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Condition"
    },
    {
        trigger: "new_or_preowned",
        response: "We specialize in pre-owned luxury watches, although we occasionally offer new or unworn pieces.",
        options: [{ label: "⬅️ Back", trigger: "watch_condition" }],
        category: "Condition"
    },
    {
        trigger: "watch_serviced",
        response: "If required, watches are serviced by our technician to ensure they are functioning properly before being sold.",
        options: [{ label: "⬅️ Back", trigger: "watch_condition" }],
        category: "Condition"
    },
    {
        trigger: "watch_polished",
        response: "Some watches may be professionally polished to improve their appearance. This will usually be mentioned in the description.",
        options: [{ label: "⬅️ Back", trigger: "watch_condition" }],
        category: "Condition"
    },
    {
        trigger: "watch_scratches",
        response: "Any visible signs of wear are usually shown in the product photos. You can also request additional photos for closer inspection.",
        options: [{ label: "⬅️ Back", trigger: "watch_condition" }],
        category: "Condition"
    },

    // ─── PAYMENT METHODS ──────────────────────────────────────────────────────
    {
        trigger: "payment_methods",
        response: "We accept several payment methods including bank transfer, credit/debit cards, and in-store payments.",
        options: [
            { label: "Can I pay cash?", trigger: "pay_cash" },
            { label: "Do you offer installments?", trigger: "installments" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Payment"
    },
    {
        trigger: "pay_cash",
        response: "Yes. Cash payments are accepted when purchasing directly at our store in Dubai.",
        options: [{ label: "⬅️ Back", trigger: "payment_methods" }],
        category: "Payment"
    },
    {
        trigger: "installments",
        response: "Installment options may be available depending on the payment provider. Please contact us for more details.",
        options: [{ label: "⬅️ Back", trigger: "payment_methods" }],
        category: "Payment"
    },

    // ─── STORE VISIT ──────────────────────────────────────────────────────────
    {
        trigger: "store_visit",
        response: "We'd love to welcome you to our store! What would you like to know?",
        options: [
            { label: "Where is your store?",             trigger: "store_location" },
            { label: "Can I see the watch in person?",   trigger: "see_in_person" },
            { label: "What are your opening hours?",     trigger: "store_hours" },
            { label: "⬅️ Back to Menu",                  trigger: "main_menu" },
        ],
        category: "Store"
    },
    {
        trigger: "store_location",
        response: "📍 Montres Watch Store\n\nMoza Plaza 1\n77FW+MJV Moza Plaza - 1 Al Khor St\nAl Corniche - Deira\nDubai, United Arab Emirates",
        options: [
            { label: "What are your hours?", trigger: "store_hours" },
            { label: "⬅️ Back",             trigger: "store_visit" },
        ],
        category: "Store"
    },
    {
        trigger: "see_in_person",
        response: "Yes, you are welcome to visit our store to view the watch in person before making a purchase.",
        options: [{ label: "⬅️ Back", trigger: "store_visit" }],
        category: "Store"
    },
    {
        trigger: "store_hours",
        response: "🕐 Store Hours:\n\n10:00 AM – 10:00 PM\nOpen Daily\n\nPlease contact us to confirm before visiting.",
        options: [{ label: "⬅️ Back", trigger: "store_visit" }],
        category: "Store"
    },

    // ─── SHIPPING ─────────────────────────────────────────────────────────────
    {
        trigger: "shipping",
        response: "We ship worldwide! Here's what you need to know:",
        options: [
            { label: "Do you ship internationally?", trigger: "ship_international" },
            { label: "Which courier do you use?", trigger: "courier" },
            { label: "Will I receive a tracking number?", trigger: "tracking" },
            { label: "How long does shipping take?", trigger: "shipping_time" },
            { label: "Customs & import duties?", trigger: "customs" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Shipping"
    },
    {
        trigger: "ship_international",
        response: "Yes, we ship worldwide using trusted courier services.",
        options: [{ label: "⬅️ Back", trigger: "shipping" }],
        category: "Shipping"
    },
    {
        trigger: "courier",
        response: "We typically ship using secure courier services such as DHL, FedEx, or similar international shipping providers.",
        options: [{ label: "⬅️ Back", trigger: "shipping" }],
        category: "Shipping"
    },
    {
        trigger: "tracking",
        response: "Yes. Once your order has been shipped, a tracking number will be provided.",
        options: [{ label: "⬅️ Back", trigger: "shipping" }],
        category: "Shipping"
    },
    {
        trigger: "shipping_time",
        response: "Shipping times depend on the destination country but usually range between 3 to 7 business days.",
        options: [{ label: "⬅️ Back", trigger: "shipping" }],
        category: "Shipping"
    },
    {
        trigger: "customs",
        response: "International buyers may be responsible for customs duties or import taxes depending on their country's regulations.",
        options: [{ label: "⬅️ Back", trigger: "shipping" }],
        category: "Shipping"
    },

    // ─── SERVICE & REPAIR ─────────────────────────────────────────────────────
    {
        trigger: "service_repair",
        response: "Our expert technicians are here to help with all your watch service needs.",
        options: [
            { label: "Do your watches come with warranty?", trigger: "warranty" },
            { label: "Do you offer watch servicing?", trigger: "watch_servicing" },
            { label: "Can you repair my watch?", trigger: "watch_repair" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Service"
    },
    {
        trigger: "warranty",
        response: "Some watches may include a warranty depending on the model and condition. Details are usually mentioned in the listing.",
        options: [{ label: "⬅️ Back", trigger: "service_repair" }],
        category: "Service"
    },
    {
        trigger: "watch_servicing",
        response: "Yes. We offer basic servicing, battery replacement, and watch inspections.",
        options: [{ label: "⬅️ Back", trigger: "service_repair" }],
        category: "Service"
    },
    {
        trigger: "watch_repair",
        response: "Yes. Our technician can assist with certain repairs and maintenance depending on the watch.",
        options: [{ label: "⬅️ Back", trigger: "service_repair" }],
        category: "Service"
    },

    // ─── SELLING ──────────────────────────────────────────────────────────────
    {
        trigger: "sell_watch",
        response: "We buy pre-owned luxury watches. Here's everything you need to know:",
        options: [
            { label: "Do you buy watches?", trigger: "do_you_buy" },
            { label: "How can I sell my watch?", trigger: "how_to_sell" },
            { label: "Is the price negotiable?", trigger: "price_negotiable" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Sales"
    },
    {
        trigger: "do_you_buy",
        response: "Yes. Montres purchases selected pre-owned luxury watches.",
        options: [
            { label: "How can I sell?", trigger: "how_to_sell" },
            { label: "⬅️ Back", trigger: "sell_watch" }
        ],
        category: "Sales"
    },
    {
        trigger: "how_to_sell",
        response: "Please send us the following details:\n\n• Brand and model\n• Watch condition\n• Your asking price\n• Clear photos of the watch\n• Box and papers (if available)\n\nOur team will review and get back to you.",
        options: [{ label: "⬅️ Back", trigger: "sell_watch" }],
        category: "Sales"
    },

    // ─── PRICE NEGOTIATION ────────────────────────────────────────────────────
    {
        trigger: "price_negotiable",
        response: "In some cases, we may consider reasonable offers. Please contact us with your offer and we will review it.",
        options: [
            { label: "What is your best price?", trigger: "best_price" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "Sales"
    },
    {
        trigger: "best_price",
        response: "Our prices are carefully set based on market value and condition. However, we may consider offers depending on the watch.",
        options: [{ label: "⬅️ Back to Menu", trigger: "main_menu" }],
        category: "Sales"
    },

    // ─── SPECIAL REQUESTS ────────────────────────────────────────────────────
    {
        trigger: "other_questions",
        response: "We're here to help! Here are some other ways we can assist:",
        options: [
            { label: "Can you find a specific watch for me?", trigger: "find_watch" },
            { label: "Can you notify me when available?", trigger: "notify_available" },
            { label: "Payment methods?", trigger: "payment_methods" },
            { label: "Watch condition questions?", trigger: "watch_condition" },
            { label: "Price negotiation?", trigger: "price_negotiable" },
            { label: "⬅️ Back to Menu", trigger: "main_menu" }
        ],
        category: "General"
    },
    {
        trigger: "find_watch",
        response: "Yes. If you are looking for a specific watch model, please contact us and we will try to source it for you.",
        options: [{ label: "⬅️ Back", trigger: "other_questions" }],
        category: "General"
    },
    {
        trigger: "notify_available",
        response: "Yes. If the watch you are looking for is currently unavailable, we can notify you when a similar piece becomes available.",
        options: [{ label: "⬅️ Back", trigger: "other_questions" }],
        category: "General"
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/montres");
        console.log("✅ Connected to MongoDB");

        await FaqBot.deleteMany({});
        console.log("🗑️  Cleared existing FAQs");

        await FaqBot.insertMany(faqs);
        console.log(`🌱 Successfully seeded ${faqs.length} FAQ entries`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
}

seed();
