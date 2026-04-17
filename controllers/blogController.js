const Blog = require('../models/Blog');
const mongoose = require('mongoose');

// Helper to calculate reading time
const calculateReadingTime = (content) => {
    const wordsPerMinute = 200;
    const text = content ? content.replace(/<[^>]*>/g, '') : ""; // Remove HTML tags
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
};

const createBlog = async (req, res, next) => {
    try {
        const { title, slug, excerpt, shortDescription, content, category, tags, author, status, featuredImage, images, metaTitle, metaDescription, featured, publishDate } = req.body;

        if (!title || !slug) {
            return res.status(400).json({ success: false, message: "Title and Slug are required" });
        }

        const existingBlog = await Blog.findOne({ slug });
        if (existingBlog) {
            return res.status(400).json({ success: false, message: "Slug already exists." });
        }

        const readingTime = calculateReadingTime(content || "");

        const newBlog = new Blog({
            title,
            slug,
            excerpt,
            shortDescription: shortDescription || excerpt,
            content,
            category: category && category !== "" ? category : null,
            tags: typeof tags === 'string' ? JSON.parse(tags) : (tags || []),
            author,
            status: status ? status.toLowerCase() : 'draft',
            readingTime,
            featured: featured === 'true' || featured === true,
            metaTitle,
            metaDescription,
            images: typeof images === 'string' ? JSON.parse(images) : (images || []),
            featuredImage: req.body.images && req.body.images.length > 0 ? req.body.images[0].url : featuredImage,
            publishDate: publishDate ? new Date(publishDate) : (status?.toLowerCase() === 'published' ? new Date() : null)
        });

        await newBlog.save();
        res.status(201).json({ success: true, message: "Blog created successfully", blog: newBlog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getBlogs = async (req, res) => {
    try {
        const { status, category, search, page = 1, limit = 10 } = req.query;
        const query = {};

        if (status) query.status = status.toLowerCase();
        if (category) query.category = category;
        if (search) query.title = { $regex: search, $options: 'i' };

        const blogs = await Blog.find(query)
            .sort({ publishDate: -1, createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const count = await Blog.countDocuments(query);

        res.status(200).json({
            success: true,
            blogs,
            totalPages: Math.ceil(count / limit),
            currentPage: Number(page)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getBlogById = async (req, res) => {
    try {
        const { id } = req.params;
        let blog;

        if (mongoose.Types.ObjectId.isValid(id)) {
            blog = await Blog.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true });
        }

        if (!blog) {
            blog = await Blog.findOneAndUpdate({ slug: id }, { $inc: { views: 1 } }, { new: true });
        }

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        res.status(200).json({ success: true, blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (updateData.tags && typeof updateData.tags === 'string') {
            updateData.tags = JSON.parse(updateData.tags);
        }

        if (updateData.images && typeof updateData.images === 'string') {
            updateData.images = JSON.parse(updateData.images);
        }

        if (req.body.images && req.body.images.length > 0) {
            updateData.featuredImage = req.body.images[0].url;
        }

        if (updateData.content) {
            updateData.readingTime = calculateReadingTime(updateData.content);
        }

        if (updateData.status) {
            updateData.status = updateData.status.toLowerCase();
            if (updateData.status === 'published' && !updateData.publishDate) {
                updateData.publishDate = new Date();
            }
        }

        if (updateData.category === "") {
            updateData.category = null;
        }

        const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedBlog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        res.status(200).json({ success: true, message: "Blog updated successfully", blog: updatedBlog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;
        await Blog.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { createBlog, getBlogs, getBlogById, updateBlog, deleteBlog };
