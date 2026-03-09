const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Configure VAPID keys
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@montres.ae',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

exports.subscribe = async (req, res) => {
    const { userId, subscription, deviceType } = req.body;

    try {
        // Find existing subscription for this specific device endpoint
        let existing = await PushSubscription.findOne({ 'subscription.endpoint': subscription.endpoint });

        if (existing) {
            existing.userId = userId;
            existing.subscription = subscription;
            existing.deviceType = deviceType || 'desktop';
            await existing.save();
        } else {
            const newSub = new PushSubscription({
                userId,
                subscription,
                deviceType: deviceType || 'desktop'
            });
            await newSub.save();
        }

        res.status(201).json({ message: 'Subscription saved successfully' });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
};

exports.sendNotification = async (userId, payload) => {
    try {
        const subscriptions = await PushSubscription.find({ userId });

        const notifications = subscriptions.map(sub => {
            return webpush.sendNotification(sub.subscription, JSON.stringify(payload))
                .catch(async (error) => {
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        // Subscription has expired or is no longer valid
                        await PushSubscription.deleteOne({ _id: sub._id });
                    }
                    console.error('Error sending push notification:', error);
                });
        });

        await Promise.all(notifications);
    } catch (error) {
        console.error('Error in sendNotification utility:', error);
    }
};
