"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = exports.loginValidation = exports.registerValidation = void 0;
const express_validator_1 = require("express-validator");
const database_1 = require("../config/database");
const auth_1 = require("../utils/auth");
exports.registerValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
];
exports.loginValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required'),
];
const register = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, email, password } = req.body;
        const existingUser = await (0, database_1.query)('SELECT id FROM users WHERE email = $1', [
            email,
        ]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = await (0, auth_1.hashPassword)(password);
        const result = await (0, database_1.query)('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [name, email, hashedPassword]);
        const user = result.rows[0];
        const token = (0, auth_1.generateToken)({ id: user.id, email: user.email, name: user.name });
        res.status(201).json({
            token,
            user: (0, auth_1.formatUser)(user),
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { email, password } = req.body;
        const result = await (0, database_1.query)('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const user = result.rows[0];
        const isMatch = await (0, auth_1.comparePassword)(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = (0, auth_1.generateToken)({ id: user.id, email: user.email, name: user.name });
        res.json({
            token,
            user: (0, auth_1.formatUser)(user),
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.login = login;
//# sourceMappingURL=authController.js.map