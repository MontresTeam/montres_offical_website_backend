const User = require("../models/UserModel");
const Customer = require("../models/customersModal");
const mongoose = require("mongoose");

// Create a new user (Save manual entries to Customer model to match previous behavior)
const createCustomer = async (req, res) => {
  try {
    const { username, email, designation, status, serialNumber } = req.body;

    // Check for duplicate email in both collections
    const existingUser = await User.findOne({ email });
    const existingCustomer = await Customer.findOne({ email });

    if (existingUser || existingCustomer)
      return res.status(400).json({ message: "Email already exists" });

    // Find the next serial number if not provided
    let sNum = serialNumber;
    if (!sNum) {
      const lastCustomer = await Customer.findOne().sort({ serialNumber: -1 });
      sNum = lastCustomer ? lastCustomer.serialNumber + 1 : 1;
    }

    const customer = new Customer({
      serialNumber: sNum,
      username,
      email,
      designation: designation || "Manual Entry",
      status: status || "active",
    });

    await customer.save();
    res.status(201).json({ message: "Customer created successfully", customer });
  } catch (error) {
    console.error("Create Customer Error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Get all users from both website logins and manual entries
const getAllCustomers = async (req, res) => {
  try {
    const [users, manualCustomers] = await Promise.all([
      User.find().sort({ createdAt: -1 }),
      Customer.find().sort({ createdAt: -1 })
    ]);

    // Map website users
    const websiteCustomers = users.map((user) => ({
      _id: user._id,
      serialNumber: 0, // Will recalculate
      joinDate: user.createdAt,
      username: user.name,
      email: user.email,
      avatar: user.avatar,
      designation: user.provider === "google" ? "Google Login" : "Email Login",
      status: "active",
      source: "website"
    }));

    // Map manual customers
    const formattedManual = manualCustomers.map((c) => ({
      _id: c._id,
      serialNumber: c.serialNumber,
      joinDate: c.joinDate,
      username: c.username,
      email: c.email,
      designation: c.designation || "Manual Entry",
      status: c.status,
      source: "manual"
    }));

    // Combine and sort by date
    const allCustomers = [...websiteCustomers, ...formattedManual].sort(
      (a, b) => new Date(b.joinDate) - new Date(a.joinDate)
    );

    // Re-assign serial numbers for display if needed, or keep original
    const finalCustomers = allCustomers.map((c, index) => ({
      ...c,
      serialNumber: c.serialNumber || (allCustomers.length - index)
    }));

    res.status(200).json({ customers: finalCustomers });
  } catch (error) {
    console.error("Get Customers Error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Get user by ID (Check both collections)
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    let data = null;
    let source = "website";

    if (mongoose.Types.ObjectId.isValid(id)) {
      data = await User.findById(id);
    }

    if (!data && mongoose.Types.ObjectId.isValid(id)) {
      data = await Customer.findById(id);
      source = "manual";
    }

    if (!data)
      return res.status(404).json({ message: "Customer not found" });

    // Map to frontend format
    const customer = {
      _id: data._id,
      joinDate: data.createdAt || data.joinDate,
      username: data.name || data.username,
      email: data.email,
      designation: source === "website"
        ? (data.provider === "google" ? "Google Login" : "Email Login")
        : (data.designation || "Manual Entry"),
      status: data.status || "active",
      source
    };

    res.status(200).json({ customer });
  } catch (error) {
    console.error("Get Customer By ID Error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Update user (Check both collections)
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, designation, status } = req.body;

    let customer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      customer = await User.findByIdAndUpdate(
        id,
        { name: username, email },
        { new: true, runValidators: true }
      );
    }

    if (!customer && mongoose.Types.ObjectId.isValid(id)) {
      customer = await Customer.findByIdAndUpdate(
        id,
        { username, email, designation, status },
        { new: true, runValidators: true }
      );
    }

    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    res.status(200).json({
      message: "Customer updated successfully",
      customer
    });
  } catch (error) {
    console.error("Update Customer Error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Delete user (Check both collections)
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    let customer = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      customer = await User.findByIdAndDelete(id);
    }

    if (!customer && mongoose.Types.ObjectId.isValid(id)) {
      customer = await Customer.findByIdAndDelete(id);
    }

    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    res.status(200).json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Delete Customer Error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

module.exports = {
  deleteCustomer,
  updateCustomer,
  getCustomerById,
  getAllCustomers,
  createCustomer
};
