const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
    return jwt.sign({ userId: user._id, role: user.role, subscription: user.subscription.plan }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (user) => {
    return jwt.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: '7d' });
};

module.exports = { generateAccessToken, generateRefreshToken };
