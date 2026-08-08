"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const database_1 = require("../config/database");
const getCategories = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_1.query)('SELECT * FROM categories WHERE is_default = true OR created_by = $1 ORDER BY name ASC', [userId]);
        res.json(result.rows.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            isDefault: c.is_default,
            createdAt: c.created_at,
        })));
    }
    catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const { name, icon, color } = req.body;
        const userId = req.user.id;
        if (!name) {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const existing = await (0, database_1.query)('SELECT id FROM categories WHERE name = $1 AND created_by = $2', [name, userId]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Category already exists' });
        }
        const result = await (0, database_1.query)('INSERT INTO categories (name, icon, color, is_default, created_by) VALUES ($1, $2, $3, false, $4) RETURNING *', [name, icon || null, color || null, userId]);
        const category = result.rows[0];
        res.status(201).json({
            id: category.id,
            name: category.name,
            icon: category.icon,
            color: category.color,
            isDefault: category.is_default,
            createdAt: category.created_at,
        });
    }
    catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const userId = req.user.id;
        const { name, icon, color } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const existing = await (0, database_1.query)('SELECT id FROM categories WHERE name = $1 AND created_by = $2 AND id != $3', [name, userId, categoryId]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Category already exists' });
        }
        const result = await (0, database_1.query)(`UPDATE categories SET name = $1, icon = $2, color = $3
       WHERE id = $4 AND created_by = $5 AND is_default = false RETURNING *`, [name, icon || null, color || null, categoryId, userId]);
        if (result.rows.length === 0) {
            return res
                .status(404)
                .json({ message: 'Category not found or cannot be edited' });
        }
        const category = result.rows[0];
        res.json({
            id: category.id,
            name: category.name,
            icon: category.icon,
            color: category.color,
            isDefault: category.is_default,
            createdAt: category.created_at,
        });
    }
    catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const userId = req.user.id;
        const result = await (0, database_1.query)('DELETE FROM categories WHERE id = $1 AND created_by = $2 AND is_default = false RETURNING id', [categoryId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Category not found or cannot be deleted' });
        }
        res.json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.deleteCategory = deleteCategory;
//# sourceMappingURL=categoryController.js.map