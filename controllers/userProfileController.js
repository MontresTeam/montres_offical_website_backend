const ProfileModal = require("../models/userProfileModal");

const createUserProfile = async (req, res) => {
  try {
    const { userId } = req.user; // from protected auth middleware
    const { name, email, phone, country, address, profilePicture } = req.body;

    if (!name || !email || !address) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Upsert the profile (Create or Update)
    const profile = await ProfileModal.findByIdAndUpdate(
      userId,
      {
        name,
        email,
        phone,
        country,
        address,
        profilePicture,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(201).json({ message: "Profile updated successfully", user: profile });
  } catch (err) {
    console.error("Profile create error:", err);

    // Handle MongoDB duplicate key error (most likely email)
    if (err.code === 11000) {
      return res.status(400).json({ message: "A profile with this email or user ID already exists." });
    }

    return res.status(500).json({ message: "Server error", error: err.message });
  }
};




const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.user;

    const profile = await ProfileModal.findById(userId);
    if (!profile) {
      return res.status(200).json({
        message: "Profile not found",
        user: null,
        orderCount: 0
      });
    }

    return res.status(200).json({ message: "Profile fetched successfully", user: profile });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
  createUserProfile,
  getUserProfile
};
