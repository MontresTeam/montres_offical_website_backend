const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const Category = require("../models/Category");

/**
 * Default built-in admins to seed/upsert
 */
const getBuiltInAdmins = () => [
  {
    username: "bebo269",
    email: "bebo269@yahoo.com",
    password: "Montres#2026",
    role: "content_manager",
    status: "active",
  },
  ...(process.env.ADMIN_CEO_USERNAME
    ? [
        {
          username: process.env.ADMIN_CEO_USERNAME,
          email: process.env.ADMIN_EMAIL || "ceo@montres.ae",
          password: process.env.ADMIN_CEO_PASSWORD || "StrongCeoPass!2025",
          role: "ceo",
          status: "active",
        },
      ]
    : []),
  ...(process.env.ADMIN_SALES_USERNAME
    ? [
        {
          username: process.env.ADMIN_SALES_USERNAME,
          email: process.env.SALES_EMAIL || "sales@montres.ae",
          password: process.env.ADMIN_SALES_PASSWORD || "StrongSalesPass!2025",
          role: "sales",
          status: "active",
        },
      ]
    : []),
  ...(process.env.ADMIN_DEV_USERNAME
    ? [
        {
          username: process.env.ADMIN_DEV_USERNAME,
          email: "dev@montres.ae",
          password: process.env.ADMIN_DEV_PASSWORD || "StrongDevPass!2025",
          role: "developer",
          status: "active",
        },
      ]
    : []),
  ...(process.env.ADMIN_MARKETING_USERNAME
    ? [
        {
          username: process.env.ADMIN_MARKETING_USERNAME,
          email: "marketing@montres.ae",
          password: process.env.ADMIN_MARKETING_PASSWORD || "StrongMarketingPass!2025",
          role: "marketing",
          status: "active",
        },
      ]
    : []),
];

/**
 * Catalog standard 5 categories
 */
const defaultCategories = [
  { name: "Watches", slug: "watches" },
  { name: "Accessories", slug: "accessories" },
  { name: "Leather Goods", slug: "leather-goods" },
  { name: "Jewelry", slug: "jewelry" },
  { name: "Gold Bullion/Coins", slug: "gold-bullion-coins" },
];

/**
 * Seed or update admin accounts in MongoDB
 */
const seedAdmins = async () => {
  try {
    const adminList = getBuiltInAdmins();
    let seededCount = 0;
    let updatedCount = 0;

    for (const adminData of adminList) {
      const normalizedUsername = adminData.username.toLowerCase().trim();
      const normalizedEmail = adminData.email.toLowerCase().trim();

      const existingAdmin = await Admin.findOne({
        $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
      });

      if (!existingAdmin) {
        // Hash password before saving
        const hashedPassword = await bcrypt.hash(adminData.password, 10);
        const newAdmin = new Admin({
          username: normalizedUsername,
          email: normalizedEmail,
          password: hashedPassword,
          role: adminData.role,
          status: adminData.status || "active",
        });
        await newAdmin.save();
        seededCount++;
        console.log(`✅ [Seed] Created admin account: ${normalizedUsername} (${adminData.role})`);
      } else {
        let isModified = false;

        // Ensure role & status are accurate
        if (existingAdmin.role !== adminData.role && adminData.username === "bebo269") {
          existingAdmin.role = adminData.role;
          isModified = true;
        }

        if (existingAdmin.status !== "active") {
          existingAdmin.status = "active";
          isModified = true;
        }

        if (existingAdmin.email !== normalizedEmail) {
          existingAdmin.email = normalizedEmail;
          isModified = true;
        }

        if (existingAdmin.username !== normalizedUsername) {
          existingAdmin.username = normalizedUsername;
          isModified = true;
        }

        // Verify password hash is valid
        const passwordMatches = await bcrypt.compare(adminData.password, existingAdmin.password);
        if (!passwordMatches) {
          existingAdmin.password = await bcrypt.hash(adminData.password, 10);
          isModified = true;
        }

        if (isModified) {
          await existingAdmin.save();
          updatedCount++;
          console.log(`🔄 [Seed] Updated admin account: ${normalizedUsername} (${existingAdmin.role})`);
        }
      }
    }

    // Seed default categories if they don't exist
    for (const cat of defaultCategories) {
      const existingCat = await Category.findOne({
        $or: [{ slug: cat.slug }, { name: new RegExp(`^${cat.name}$`, "i") }],
      });
      if (!existingCat) {
        await Category.create(cat);
        console.log(`✅ [Seed] Created default category: ${cat.name}`);
      }
    }

    return { success: true, seededCount, updatedCount };
  } catch (error) {
    console.error("❌ [Seed] Error seeding admin accounts:", error.message || error);
    return { success: false, error: error.message };
  }
};

module.exports = { seedAdmins, getBuiltInAdmins, defaultCategories };
