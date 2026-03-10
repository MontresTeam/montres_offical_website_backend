const Message = require('../models/Message');
const User = require('../models/UserModel');
const ChatStatus = require('../models/ChatStatus');
const CustomerStatus = require('../models/CustomerStatus');
const pushController = require('../controllers/pushController');
const mongoose = require('mongoose');

const ADMIN_ROOM = "admin_room";
// Track online users: userId -> Set of socketIds (to handle multiple tabs)
const onlineUsers = new Map();
// Track if any admin is online (socket-wise)
let adminSocketConnected = false;

const socketHandler = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        let currentUserId = null;
        let currentUserRole = null;

        // Join a private room for the user/admin based on their ID or session
        socket.on('join', async ({ userId, role }) => {
            console.log(`${role} ${userId} connected`);
            socket.join(userId);
            currentUserId = userId;
            currentUserRole = role;

            // Track online status
            if (!onlineUsers.has(userId)) {
                onlineUsers.set(userId, new Set());
            }
            onlineUsers.get(userId).add(socket.id);

            let userName = null;
            let userEmail = null;

            // Fetch real user info if not a guest or anonymous user ID
            if (userId && !userId.startsWith('guest_') && !userId.startsWith('user_') && mongoose.Types.ObjectId.isValid(userId)) {
                try {
                    const user = await User.findById(userId).select('name email');
                    if (user) {
                        userName = user.name;
                        userEmail = user.email;
                    }
                } catch (e) {
                    console.error('Error fetching user info on join:', e);
                }
            }

            // Admins join a specific room to receive all user notifications
            if (role === 'admin') {
                socket.join(ADMIN_ROOM);
                adminSocketConnected = true;

                // Get persisted status
                let chatStatus = await ChatStatus.findOne({ adminId: 'admin_main' });
                const currentStatus = chatStatus?.isOnline ? 'online' : 'offline';

                // Notify all users that admin is online/offline based on toggle
                io.emit('adminStatus', {
                    status: currentStatus,
                    lastSeen: chatStatus?.lastSeen
                });

                // Send current list of online users to this admin
                const users = Array.from(onlineUsers.keys());
                socket.emit('onlineUsersList', users);
                console.log(`Admin ${userId} joined common admin room`);
            } else {
                // Notify admins that a user is online
                io.to(ADMIN_ROOM).emit('userStatus', { userId, status: 'online' });
            }

            // Send current status of admin to the joining user
            if (role === 'user') {
                let chatStatus = await ChatStatus.findOne({ adminId: 'admin_main' });
                const isConfiguredOnline = chatStatus ? chatStatus.isOnline : true;

                // Admin is considered online ONLY if both socket is connected AND toggle is on
                const status = (adminSocketConnected && isConfiguredOnline) ? 'online' : 'offline';
                socket.emit('adminStatus', {
                    status,
                    lastSeen: chatStatus?.lastSeen
                });

                // Notify admins that this specific user is online
                io.to(ADMIN_ROOM).emit('userStatus', {
                    userId,
                    status: 'online',
                    userName,
                    userEmail
                });
            }
        });

        // Handle sending a message
        socket.on('sendMessage', async (data) => {
            const { senderId, receiverId, content, senderRole } = data;

            try {
                // Save to database
                const newMessage = new Message({
                    senderId,
                    receiverId,
                    content,
                    senderRole
                });
                await newMessage.save();

                // Send to receiver (private chat)
                io.to(receiverId).emit('receiveMessage', data);

                // If message is from a user, broadcast to all online admins (sidebar update)
                if (senderRole === 'user' || senderRole === 'customer') {
                    socket.to(ADMIN_ROOM).emit('newUserMessage', data);

                    // TRIGGER PUSH NOTIFICATION FOR ADMIN
                    try {
                        let customerName = "Customer";
                        // Find user details for the name
                        if (senderId && !senderId.startsWith('guest_') && !senderId.startsWith('user_') && mongoose.Types.ObjectId.isValid(senderId)) {
                            const user = await User.findById(senderId).select('name');
                            if (user) customerName = user.name;
                        } else if (senderId && (senderId.startsWith('guest_') || senderId.startsWith('user_'))) {
                            const prefix = senderId.startsWith('guest_') ? 'Guest' : 'User';
                            const offset = senderId.startsWith('guest_') ? 6 : 5;
                            customerName = `${prefix} ${senderId.substring(offset, offset + 5)}`;
                        }

                        // Get unread count for admin
                        const unreadCount = await Message.countDocuments({
                            receiverId: 'admin_main',
                            isRead: false
                        });

                        const pushPayload = {
                            title: `Message from ${customerName}`,
                            body: content.length > 60 ? content.substring(0, 60) + '...' : content,
                            icon: 'https://admin.montres.ae/icon-192.png',
                            badge: 'https://admin.montres.ae/icon-192.png',
                            data: {
                                url: 'https://admin.montres.ae/support/chat',
                                badgeCount: unreadCount
                            }
                        };

                        // Send push to standard admin ID
                        await pushController.sendNotification('admin_main', pushPayload);
                    } catch (pushErr) {
                        console.error('Push notification failed:', pushErr);
                    }
                }

                // If an admin sends a message, sync it to all other admins (chat window update)
                if (senderRole === 'admin') {
                    socket.to(ADMIN_ROOM).emit('receiveMessage', data);
                }

                // Also send back to sender for acknowledgment (e.g. if they have multiple tabs open)
                socket.emit('messageSent', data);

            } catch (err) {
                console.error('Error in sendMessage socket:', err);
                socket.emit('errorMessage', 'Failed to send message');
            }
        });

        // Handle typing status
        socket.on('typing', (data) => {
            const { receiverId, isTyping, senderId, senderName } = data;
            io.to(receiverId).emit('typingStatus', { isTyping, senderId, senderName });
        });

        // Provide a way to check if a specific user is online
        socket.on('checkUserStatus', (userId) => {
            const isOnline = onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
            socket.emit('userStatus', { userId, status: isOnline ? 'online' : 'offline' });
        });

        // Handle manual admin status toggle from dashboard
        socket.on('toggleAdminStatus', async ({ isOnline }) => {
            if (currentUserRole === 'admin') {
                try {
                    await ChatStatus.findOneAndUpdate(
                        { adminId: 'admin_main' },
                        { isOnline },
                        { new: true, upsert: true }
                    );

                    // Admin is considered online ONLY if socket is connected AND toggle is on
                    // Since the admin is sending this event, socket IS connected.
                    const finalStatus = isOnline ? 'online' : 'offline';

                    const updateData = { isOnline };
                    if (!isOnline) {
                        updateData.lastSeen = new Date();
                    }

                    const statusDoc = await ChatStatus.findOneAndUpdate(
                        { adminId: 'admin_main' },
                        updateData,
                        { new: true, upsert: true }
                    );

                    io.emit('adminStatus', {
                        status: finalStatus,
                        lastSeen: statusDoc.lastSeen
                    });
                    console.log(`Admin manually set status to: ${finalStatus}`);
                } catch (err) {
                    console.error('Error toggling admin status:', err);
                }
            }
        });

        socket.on('disconnect', async () => {
            console.log('User disconnected:', socket.id);
            if (currentUserId) {
                const userSockets = onlineUsers.get(currentUserId);
                if (userSockets) {
                    userSockets.delete(socket.id);
                    if (userSockets.size === 0) {
                        onlineUsers.delete(currentUserId);

                        if (currentUserRole === 'admin') {
                            // Check if any OTHER admin is still online
                            let anyAdminLeft = false;
                            const adminRoom = io.sockets.adapter.rooms.get(ADMIN_ROOM);
                            if (adminRoom && adminRoom.size > 0) {
                                anyAdminLeft = true;
                            }

                            if (!anyAdminLeft) {
                                adminSocketConnected = false;

                                // Update last seen in DB
                                const lastSeenDate = new Date();
                                await ChatStatus.findOneAndUpdate(
                                    { adminId: 'admin_main' },
                                    { lastSeen: lastSeenDate },
                                    { upsert: true }
                                );

                                io.emit('adminStatus', {
                                    status: 'offline',
                                    lastSeen: lastSeenDate
                                });
                            }
                        } else {
                            // Notify admins that user went offline
                            const lastSeenDate = new Date();

                            // Update lastSeen in DB
                            if (currentUserId && !currentUserId.startsWith('guest_') && !currentUserId.startsWith('user_') && mongoose.Types.ObjectId.isValid(currentUserId)) {
                                try {
                                    await User.findByIdAndUpdate(currentUserId, { lastSeen: lastSeenDate });
                                } catch (e) { }
                            } else if (currentUserId) {
                                try {
                                    await CustomerStatus.findOneAndUpdate(
                                        { customerId: currentUserId },
                                        { lastSeen: lastSeenDate },
                                        { upsert: true }
                                    );
                                } catch (e) { }
                            }

                            io.to(ADMIN_ROOM).emit('userStatus', {
                                userId: currentUserId,
                                status: 'offline',
                                lastSeen: lastSeenDate
                            });
                        }
                    }
                }
            }
        });
    });
};

module.exports = socketHandler;

