const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    shortDescription: { type: String },
    excerpt: { type: String }, // Keep for compatibility if used
    content: { type: String }, // HTML or JSON rich text
    featuredImage: { type: String },
    images: [{ type: String }],
    author: { type: String },
    category: {
        type: String,
        enum: [
            'Watch Guides',
            'Buying Tips',
            'Brand Stories',
            'Watch Education',
            'Market & News',
            'Collectors & Lifestyle'
        ],
        required: false,
        default: null
    },
    tags: [{ type: String }],
    status: {
        type: String,
        enum: ['draft', 'published', 'scheduled'],
        default: 'draft'
    },
    publishDate: { type: Date },
    readingTime: { type: Number, default: 0 },
    metaTitle: { type: String },
    metaDescription: { type: String },
    views: { type: Number, default: 0 },
    featured: { type: Boolean, default: false }
}, {
    timestamps: true
});

module.exports = mongoose.model('Blog', BlogSchema);
