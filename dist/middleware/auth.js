"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const result = await (0, database_1.query)('SELECT id, name, email FROM users WHERE id = $1', [
            decoded.id,
        ]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Token is not valid' });
        }
        req.user = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
        };
        next();
    }
    catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};
exports.authenticate = authenticate;
//# sourceMappingURL=auth.js.map