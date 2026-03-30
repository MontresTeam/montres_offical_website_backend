const express = require('express');
const { createCategory, getCategories, updateCategory, deleteCategory } = require('../controllers/categoryController');
const { adminProtect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', getCategories);
router.use(adminProtect);
router.post('/add', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
