const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const ChatStatus = require('../models/ChatStatus');

// Get chat status
router.get('/status', async (req, res) => {
    try {
        let status = await ChatStatus.findOne({ adminId: 'admin_main' });
        if (!status) {
            status = await ChatStatus.create({ adminId: 'admin_main', isOnline: true });
        }
        res.json(status);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update chat status
router.put('/status', async (req, res) => {
    try {
        const { isOnline } = req.body;
        const status = await ChatStatus.findOneAndUpdate(
            { adminId: 'admin_main' },
            { isOnline },
            { new: true, upsert: true }
        );
        res.json(status);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Submit offline message
router.post('/offline-message', async (req, res) => {
    try {
        const { name, contact, message: content } = req.body;
        const io = req.app.get('socketio');
        const pushController = require('../controllers/pushController');

        // Generate a guest ID if not provided
        const guestId = `guest_${Math.random().toString(36).substr(2, 9)}`;

        const newMessage = new Message({
            senderId: guestId,
            receiverId: 'admin_main',
            content: content,
            senderRole: 'user',
            senderName: name,
            senderContact: contact,
            isRead: false
        });

        await newMessage.save();

        // Notify via socket if io is available (e.g. update admin sidebar)
        if (io) {
            io.to('admin_room').emit('newUserMessage', {
                senderId: guestId,
                receiverId: 'admin_main',
                content: content,
                senderRole: 'user',
                senderName: name,
                timestamp: newMessage.createdAt
            });
        }

        // Trigger push notification
        try {
            const unreadCount = await Message.countDocuments({
                receiverId: 'admin_main',
                isRead: false
            });

            const pushPayload = {
                title: `Offline Message from ${name}`,
                body: content.length > 60 ? content.substring(0, 60) + '...' : content,
                icon: 'https://admin.montres.ae/icon-192.png',
                data: {
                    url: 'https://admin.montres.ae/support/chat',
                    badgeCount: unreadCount
                }
            };

            await pushController.sendNotification('admin_main', pushPayload);
        } catch (pushErr) {
            console.error('Push notification for offline message failed:', pushErr);
        }

        res.status(201).json({ message: 'Offline message saved successfully', data: newMessage });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// FAQ BOT ROUTES  (MUST be defined BEFORE the generic /:userId/:otherId route)
// ─────────────────────────────────────────────────────────────────────────────
const FaqBot = require('../models/FaqBot');

// Get all FAQs (Admin)
router.get('/faq/all', async (req, res) => {
    try {
        const faqs = await FaqBot.find().sort({ trigger: 1 });
        res.json(faqs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get FAQ response by trigger (Chatbot)  
// NOTE: Keep this above /:userId/:otherId or Express will match faq/trigger as userId/otherId
router.get('/faq/:trigger', async (req, res) => {
    try {
        const faq = await FaqBot.findOne({ trigger: req.params.trigger });
        if (!faq) {
            return res.status(404).json({ message: 'No response found for this trigger' });
        }
        res.json(faq);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Upsert FAQ (Admin)
router.post('/faq', async (req, res) => {
    try {
        const { trigger, response, options, category } = req.body;
        const faq = await FaqBot.findOneAndUpdate(
            { trigger },
            { response, options, category },
            { new: true, upsert: true }
        );
        res.status(201).json(faq);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete FAQ (Admin)
router.delete('/faq/:id', async (req, res) => {
    try {
        await FaqBot.findByIdAndDelete(req.params.id);
        res.json({ message: 'FAQ deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAT HISTORY & CONVERSATION ROUTES  (generic wildcards come AFTER specifics)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:userId/:otherId', async (req, res) => {
    try {
        const { userId, otherId } = req.params;
        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: otherId },
                { senderId: otherId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get all unique conversations for an admin with metadata
router.get('/conversations', async (req, res) => {
    try {
        const adminId = 'admin_main'; // Standard admin ID

        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: adminId },
                        { receiverId: adminId }
                    ]
                }
            },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [
                            { $eq: ["$senderId", adminId] },
                            "$receiverId",
                            "$senderId"
                        ]
                    },
                    isUnreadForAdmin: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$receiverId", adminId] },
                                    { $eq: ["$isRead", false] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: "$otherUserId",
                    lastMessage: { $first: "$content" },
                    lastTimestamp: { $first: "$timestamp" },
                    unreadCount: { $sum: "$isUnreadForAdmin" },
                    totalMessages: { $sum: 1 },
                    senderName: { $first: "$senderName" },
                    senderContact: { $first: "$senderContact" }
                }
            },
            // Lookup user info (joining string otherUserId with ObjectId User._id)
            {
                $addFields: {
                    userObjectId: {
                        $cond: [
                            { $regexMatch: { input: "$_id", regex: /^[0-9a-fA-F]{24}$/ } },
                            { $toObjectId: "$_id" },
                            null
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: "users",
                    let: { searchId: "$_id", objectId: "$userObjectId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ["$_id", "$$objectId"] },
                                        { $eq: ["$googleId", "$$searchId"] },
                                        { $eq: ["$facebookId", "$$searchId"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "userInfo"
                }
            },
            {
                $lookup: {
                    from: "customerstatuses",
                    localField: "_id",
                    foreignField: "customerId",
                    as: "guestStatus"
                }
            },
            {
                $addFields: {
                    userName: {
                        $cond: [
                            { $gt: [{ $size: "$userInfo" }, 0] },
                            { $arrayElemAt: ["$userInfo.name", 0] },
                            {
                                $ifNull: [
                                    "$senderName",
                                    { $concat: ["Guest ", { $substr: ["$_id", 0, 8] }] }
                                ]
                            }
                        ]
                    },
                    userEmail: {
                        $cond: [
                            { $gt: [{ $size: "$userInfo" }, 0] },
                            { $arrayElemAt: ["$userInfo.email", 0] },
                            "$senderContact"
                        ]
                    },
                    userAvatar: { $arrayElemAt: ["$userInfo.avatar", 0] },
                    lastSeen: {
                        $cond: [
                            { $gt: [{ $size: "$userInfo" }, 0] },
                            { $arrayElemAt: ["$userInfo.lastSeen", 0] },
                            { $arrayElemAt: ["$guestStatus.lastSeen", 0] }
                        ]
                    }
                }
            },
            { $project: { userInfo: 0, userObjectId: 0, guestStatus: 0 } },
            { $sort: { lastTimestamp: -1 } }
        ]);

        res.json(messages);
    } catch (err) {
        console.error("Aggregation error:", err);
        res.status(500).json({ message: err.message });
    }
});

// Mark messages as read
router.put('/read/:userId', async (req, res) => {
    try {
        const adminId = 'admin_main';
        const { userId } = req.params;

        await Message.updateMany(
            { senderId: userId, receiverId: adminId, isRead: false },
            { $set: { isRead: true } }
        );

        res.json({ message: 'Messages marked as read' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
