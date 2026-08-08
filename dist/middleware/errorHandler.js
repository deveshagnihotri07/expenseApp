"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message || 'Server error' });
};
exports.errorHandler = errorHandler;
const notFound = (req, res) => {
    res.status(404).json({ message: 'Route not found' });
};
exports.notFound = notFound;
//# sourceMappingURL=errorHandler.js.map