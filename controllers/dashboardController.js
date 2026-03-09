const Order = require("../models/OrderModel");
const Purchase = require("../models/Purchase");
const User = require("../models/UserModel");
const Customer = require("../models/customersModal");
const mongoose = require("mongoose");

/**
 * Get Dashboard Statistics
 * Includes Revenue, Expenses, Customer counts and Growth rates
 */
const getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // 1. Revenue Calculations (Paid Orders)
        const allOrders = await Order.find({ paymentStatus: "paid" }).select("total createdAt").lean();

        const totalEarning = allOrders.reduce((acc, order) => acc + (order.total || 0), 0);

        const currentMonthRevenue = allOrders
            .filter(o => o.createdAt >= currentMonthStart)
            .reduce((acc, o) => acc + (o.total || 0), 0);

        const lastMonthRevenue = allOrders
            .filter(o => o.createdAt >= lastMonthStart && o.createdAt <= lastMonthEnd)
            .reduce((acc, o) => acc + (o.total || 0), 0);

        // Calculate Growth Rate
        let revenueGrowth = 0;
        if (lastMonthRevenue > 0) {
            revenueGrowth = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
        } else if (currentMonthRevenue > 0) {
            revenueGrowth = 100; // First month of revenue
        }

        // 2. Expense Calculations (Purchases)
        const allPurchases = await Purchase.find().select("total_cost createdAt").lean();
        const totalExpense = allPurchases.reduce((acc, p) => acc + (p.total_cost || 0), 0);

        const currentMonthExpense = allPurchases
            .filter(p => p.createdAt >= currentMonthStart)
            .reduce((acc, p) => acc + (p.total_cost || 0), 0);

        // 3. Customer Statistics
        const [totalWebUsers, totalManualCustomers] = await Promise.all([
            User.countDocuments(),
            Customer.countDocuments()
        ]);

        const totalCustomers = totalWebUsers + totalManualCustomers;

        // Growth for customers (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [recentWebUsers, recentManual] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            Customer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } })
        ]);

        const recentTotal = recentWebUsers + recentManual;
        const previousTotal = totalCustomers - recentTotal;

        let customerGrowth = 0;
        if (previousTotal > 0) {
            customerGrowth = (recentTotal / previousTotal) * 100;
        } else if (recentTotal > 0) {
            customerGrowth = 100;
        }

        // 4. Chart Data (Last 6-12 Months)
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0, 23, 59, 59);

            const monthEarning = allOrders
                .filter(o => o.createdAt >= start && o.createdAt <= end)
                .reduce((acc, o) => acc + (o.total || 0), 0);

            const monthExpense = allPurchases
                .filter(p => p.createdAt >= start && p.createdAt <= end)
                .reduce((acc, p) => acc + (p.total_cost || 0), 0);

            chartData.push({
                name: monthNames[m],
                earning: Math.round(monthEarning),
                expense: Math.round(monthExpense),
                net: Math.round(monthEarning - monthExpense)
            });
        }

        res.status(200).json({
            success: true,
            revenue: {
                totalEarning,
                totalExpense,
                netRevenue: totalEarning - totalExpense,
                growth: revenueGrowth.toFixed(1),
                currentMonthRevenue,
                lastMonthRevenue,
                chartData
            },
            customers: {
                total: totalCustomers,
                website: totalWebUsers,
                manual: totalManualCustomers,
                growth: customerGrowth.toFixed(1),
                split: {
                    male: Math.round(totalCustomers * 0.45), // Mocked split as gender not in DB
                    female: Math.round(totalCustomers * 0.55)
                }
            }
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching dashboard data" });
    }
};

module.exports = {
    getDashboardStats
};
