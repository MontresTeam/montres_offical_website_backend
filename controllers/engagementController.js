const Product = require("../models/product");
const Watchlist = require("../models/Watchlist");
const SellerOffer = require("../models/SellerOffer");
const UserOffer = require("../models/UserOffer");
const mongoose = require("mongoose");

// @desc    Increment product views
// @route   POST /api/engagement/view/:id
// @access  Public
exports.incrementViews = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { views_count: 1 } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Broadcast view update
    const io = req.app.get('socketio');
    if (io) {
      io.emit(`engagement:views:${req.params.id}`, { views: product.views_count });
    }

    res.status(200).json({ views: product.views_count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle watchlist status
// @route   POST /api/engagement/watch/:id
// @access  Private
exports.toggleWatch = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    const existingWatch = await Watchlist.findOne({ user: userId, product: productId });

    if (existingWatch) {
      const updatedProduct = await Product.findByIdAndUpdate(productId, { $inc: { watchers_count: -1 } }, { new: true });
      
      const io = req.app.get('socketio');
      if (io) {
        io.emit(`engagement:watchers:${productId}`, { watchers: updatedProduct.watchers_count });
      }
      
      return res.status(200).json({ watched: false, message: "Removed from watchlist" });
    } else {
      // Add to watchlist
      await Watchlist.create({ user: userId, product: productId });
      const updatedProduct = await Product.findByIdAndUpdate(productId, { $inc: { watchers_count: 1 } }, { new: true });
      
      const io = req.app.get('socketio');
      if (io) {
        io.emit(`engagement:watchers:${productId}`, { watchers: updatedProduct.watchers_count });
      }
      
      return res.status(200).json({ watched: true, message: "Added to watchlist" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get watch status for a product
// @route   GET /api/engagement/watch-status/:id
// @access  Private
exports.getWatchStatus = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    const existingWatch = await Watchlist.findOne({ user: userId, product: productId });
    res.status(200).json({ watched: !!existingWatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send offer to all watchers
// @route   POST /api/engagement/send-offer
// @access  Admin/Seller
exports.sendOfferToWatchers = async (req, res) => {
  try {
    const { productId, discountPrice, discountPercent, expiresAt, message } = req.body;

    // Create the seller offer
    const sellerOffer = await SellerOffer.create({
      product: productId,
      discountPrice,
      discountPercent,
      expiresAt,
      message,
    });

    // Find all watchers for this product
    const watchers = await Watchlist.find({ product: productId });

    if (watchers.length === 0) {
      return res.status(400).json({ message: "No watchers for this product" });
    }

    // Map the offer to all watchers
    const userOfferPromises = watchers.map((watcher) => {
      return UserOffer.create({
        user: watcher.user,
        offer: sellerOffer._id,
        status: "pending",
      });
    });

    await Promise.all(userOfferPromises);

    // Notify all online watchers via Socket.io
    const io = req.app.get('socketio');
    if (io) {
      watchers.forEach(watcher => {
        io.to(watcher.user.toString()).emit('engagement:new_offer', {
          productId,
          message: "Seller sent you a special offer!",
          offerId: sellerOffer._id
        });
      });
    }

    res.status(201).json({
      message: `Offer sent to ${watchers.length} watchers`,
      offer: sellerOffer,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get active offers for a user
// @route   GET /api/engagement/my-offers
// @access  Private
exports.getMyOffers = async (req, res) => {
  try {
    const userId = req.user._id;

    const userOffers = await UserOffer.find({ user: userId, status: "pending" })
      .populate({
        path: "offer",
        populate: {
          path: "product",
          select: "name images salePrice regularPrice slug",
        },
      })
      .sort({ createdAt: -1 });

    // Filter out expired offers
    const now = new Date();
    const activeOffers = userOffers.filter((uo) => uo.offer && uo.offer.expiresAt > now);

    res.status(200).json(activeOffers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Respond to an offer
// @route   POST /api/engagement/respond-offer/:id
// @access  Private
exports.respondToOffer = async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'declined'
    const userOfferId = req.params.id;

    const userOffer = await UserOffer.findById(userOfferId);

    if (!userOffer || userOffer.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: "Offer not found" });
    }

    userOffer.status = status;
    await userOffer.save();

    res.status(200).json({ message: `Offer ${status}`, userOffer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
