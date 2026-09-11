const Order = require("../models/OrderModel");
const Purchase = require("../models/Purchase");
const User = require("../models/UserModel");
const Customer = require("../models/customersModal");
const Product = require("../models/product");
const mongoose = require("mongoose");

/**
 * Get Dashboard Statistics
 * Includes Revenue, Expenses, Customer counts, Growth rates,
 * Top Selling Products, Recent Orders, and Weekly Top Customers
 */
const getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // 1. All Orders & Revenue Calculations
        const [allOrders, paidOrders] = await Promise.all([
            Order.find().sort({ createdAt: -1 }).lean(),
            Order.find({ paymentStatus: "paid" }).lean()
        ]);

        const revenueOrders = paidOrders.length > 0 ? paidOrders : allOrders.filter(o => o.orderStatus?.toLowerCase() !== 'cancelled');

        const totalEarning = revenueOrders.reduce((acc, order) => acc + (order.total || 0), 0);

        const currentMonthRevenue = revenueOrders
            .filter(o => new Date(o.createdAt) >= currentMonthStart)
            .reduce((acc, o) => acc + (o.total || 0), 0);

        const lastMonthRevenue = revenueOrders
            .filter(o => new Date(o.createdAt) >= lastMonthStart && new Date(o.createdAt) <= lastMonthEnd)
            .reduce((acc, o) => acc + (o.total || 0), 0);

        // Calculate Revenue Growth Rate
        let revenueGrowth = 0;
        if (lastMonthRevenue > 0) {
            revenueGrowth = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
        } else if (currentMonthRevenue > 0) {
            revenueGrowth = 100;
        }

        // 2. Average Order Value (AOV)
        const totalValidOrdersCount = revenueOrders.length;
        const averageOrderValue = totalValidOrdersCount > 0 
            ? Math.round((totalEarning / totalValidOrdersCount) * 100) / 100 
            : 0;

        // 3. Customer Calculations & Repeat Purchase Rate
        const [allWebUsers, allManualCustomers] = await Promise.all([
            User.find().lean(),
            Customer.find().lean()
        ]);

        const totalCustomers = allWebUsers.length + allManualCustomers.length;

        // Repeat purchase rate: customers with > 1 order
        const customerOrderCounts = {};
        allOrders.forEach(o => {
            const key = (o.userId ? o.userId.toString() : null) || o.shippingAddress?.email || o.billingAddress?.email;
            if (key) {
                customerOrderCounts[key] = (customerOrderCounts[key] || 0) + 1;
            }
        });

        const uniqueCustomerKeys = Object.keys(customerOrderCounts);
        const repeatCustomers = uniqueCustomerKeys.filter(k => customerOrderCounts[k] > 1);
        const repeatPurchaseRate = uniqueCustomerKeys.length > 0
            ? Math.round((repeatCustomers.length / uniqueCustomerKeys.length) * 10000) / 100
            : 0;

        // Customer Growth (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentWebUsers = allWebUsers.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;
        const recentManual = allManualCustomers.filter(c => new Date(c.createdAt || c.joinDate) >= thirtyDaysAgo).length;
        const recentCustomers = recentWebUsers + recentManual;
        const previousTotal = totalCustomers - recentCustomers;

        let customerGrowth = 0;
        if (previousTotal > 0) {
            customerGrowth = Math.round(((recentCustomers / previousTotal) * 100) * 10) / 10;
        } else if (recentCustomers > 0) {
            customerGrowth = 100;
        }

        // Conversion rate estimate (orders vs customers)
        const conversionRate = totalCustomers > 0
            ? Math.min(100, Math.round(((allOrders.length / totalCustomers) * 100) * 10) / 10)
            : 0;

        // 4. Expenses (Purchases)
        const allPurchases = await Purchase.find().select("total_cost createdAt").lean();
        const totalExpense = allPurchases.reduce((acc, p) => acc + (p.total_cost || 0), 0);

        // 5. Chart Data (Last 6 Months)
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59);

            const monthOrders = allOrders.filter(o => {
                const od = new Date(o.createdAt);
                return od >= start && od <= end;
            });

            const monthEarning = revenueOrders
                .filter(o => {
                    const od = new Date(o.createdAt);
                    return od >= start && od <= end;
                })
                .reduce((acc, o) => acc + (o.total || 0), 0);

            const monthExpense = allPurchases
                .filter(p => {
                    const pd = new Date(p.createdAt);
                    return pd >= start && pd <= end;
                })
                .reduce((acc, p) => acc + (p.total_cost || 0), 0);

            chartData.push({
                name: monthNames[m],
                ordersCount: monthOrders.length,
                earning: Math.round(monthEarning),
                expense: Math.round(monthExpense),
                net: Math.round(monthEarning - monthExpense)
            });
        }

        // 6. Recent Orders (Top 5-10 latest)
        const recentOrders = allOrders.slice(0, 5).map(o => {
            const firstItem = o.items && o.items.length > 0 ? o.items[0] : null;
            const firstName = o.shippingAddress?.firstName || "";
            const lastName = o.shippingAddress?.lastName || "";
            const customerName = `${firstName} ${lastName}`.trim() || o.shippingAddress?.email || "Customer";

            return {
                _id: o._id,
                orderId: o.orderId ? (o.orderId.startsWith('#') ? o.orderId : `#${o.orderId}`) : `#${o._id.toString().slice(-7).toUpperCase()}`,
                productName: firstItem?.name || (o.items?.length > 1 ? `${firstItem?.name || 'Item'} + ${o.items.length - 1} more` : "Montres Product"),
                productImage: firstItem?.image || "/assets/images/product/product-img1.png",
                customerName: customerName,
                customerLink: "/users-list",
                date: new Date(o.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }),
                status: o.orderStatus || "Pending",
                total: o.total || 0
            };
        });

        // 7. Most Selling Products
        const productSalesCount = {};
        const productDetails = {};

        allOrders.forEach(o => {
            if (o.items && Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const key = item.productId ? item.productId.toString() : item.name;
                    if (key) {
                        productSalesCount[key] = (productSalesCount[key] || 0) + (item.quantity || 1);
                        if (!productDetails[key]) {
                            productDetails[key] = {
                                id: item.productId ? item.productId.toString().slice(-7).toUpperCase() : (item.sku || "N/A"),
                                name: item.name,
                                image: item.image || "/assets/images/product/product-img1.png",
                                url: "/productmanage"
                            };
                        }
                    }
                });
            }
        });

        let topSellingProducts = Object.keys(productSalesCount)
            .sort((a, b) => productSalesCount[b] - productSalesCount[a])
            .slice(0, 5)
            .map(key => ({
                id: productDetails[key].id,
                name: productDetails[key].name,
                image: productDetails[key].image,
                sales: `${productSalesCount[key]} Sales`,
                url: productDetails[key].url
            }));

        // If fewer than 3 top selling products from orders, backfill with real products from DB catalog
        if (topSellingProducts.length < 3) {
            try {
                const catalogProducts = await Product.find({ published: true })
                    .sort({ inStock: -1, createdAt: -1 })
                    .limit(5)
                    .lean();

                const existingIds = new Set(topSellingProducts.map(p => p.name));
                for (const prod of catalogProducts) {
                    if (topSellingProducts.length >= 5) break;
                    if (!existingIds.has(prod.name)) {
                        const img = Array.isArray(prod.images) && prod.images.length > 0 
                            ? (typeof prod.images[0] === 'string' ? prod.images[0] : prod.images[0]?.url) 
                            : (prod.image || "/assets/images/product/product-img1.png");

                        topSellingProducts.push({
                            id: prod.referenceNumber || prod.sku || prod._id.toString().slice(-7).toUpperCase(),
                            name: prod.name || `${prod.brand || ''} ${prod.model || ''}`.trim() || "Luxury Watch",
                            image: img,
                            sales: prod.stockQuantity ? `${prod.stockQuantity} In Stock` : "Available",
                            url: `/productmanage`
                        });
                    }
                }
            } catch (err) {
                console.error("Catalog fallback error in dashboard:", err);
            }
        }

        // 8. Weekly Top Customers
        const customerStatsMap = {};
        allOrders.forEach(o => {
            const key = (o.userId ? o.userId.toString() : null) || o.shippingAddress?.email;
            if (key) {
                const firstName = o.shippingAddress?.firstName || "";
                const lastName = o.shippingAddress?.lastName || "";
                const name = `${firstName} ${lastName}`.trim() || o.shippingAddress?.email || "Customer";

                if (!customerStatsMap[key]) {
                    customerStatsMap[key] = {
                        id: o.userId || key,
                        name: name,
                        email: o.shippingAddress?.email || "",
                        ordersCount: 0,
                        totalSpent: 0
                    };
                }
                customerStatsMap[key].ordersCount += 1;
                customerStatsMap[key].totalSpent += (o.total || 0);
            }
        });

        let topCustomers = Object.values(customerStatsMap)
            .sort((a, b) => b.ordersCount - a.ordersCount || b.totalSpent - a.totalSpent)
            .slice(0, 5)
            .map((c, idx) => ({
                id: c.id || idx + 1,
                name: c.name,
                image: null,
                orders: `${c.ordersCount} ${c.ordersCount === 1 ? 'Order' : 'Orders'}`,
                url: "/users-list"
            }));

        // Backfill with real registered users or manual customers if fewer than 3
        if (topCustomers.length < 3) {
            const combinedUsers = [
                ...allWebUsers.map(u => ({
                    id: u._id,
                    name: u.name || u.email?.split('@')[0] || "User",
                    image: u.avatar || null,
                    orders: `${u.myOrders?.length || 0} Orders`,
                    url: "/users-list"
                })),
                ...allManualCustomers.map(c => ({
                    id: c._id,
                    name: c.username || c.email?.split('@')[0] || "Customer",
                    image: null,
                    orders: "1 Order",
                    url: "/users-list"
                }))
            ];

            const existingCustomerNames = new Set(topCustomers.map(c => c.name));
            for (const user of combinedUsers) {
                if (topCustomers.length >= 5) break;
                if (!existingCustomerNames.has(user.name)) {
                    topCustomers.push(user);
                    existingCustomerNames.add(user.name);
                }
            }
        }

        res.status(200).json({
            success: true,
            revenue: {
                totalEarning,
                totalExpense,
                netRevenue: totalEarning - totalExpense,
                growth: Number(revenueGrowth.toFixed(1)),
                currentMonthRevenue,
                lastMonthRevenue,
                averageOrderValue,
                totalOrders: allOrders.length,
                chartData
            },
            customers: {
                total: totalCustomers,
                website: allWebUsers.length,
                manual: allManualCustomers.length,
                growth: Number(customerGrowth.toFixed(1)),
                newThisMonth: recentCustomers,
                repeatPurchaseRate: Number(repeatPurchaseRate.toFixed(2)),
                conversionRate: Number(conversionRate.toFixed(2))
            },
            topSellingProducts,
            recentOrders,
            topCustomers
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching dashboard data" });
    }
};

module.exports = {
    getDashboardStats
};
