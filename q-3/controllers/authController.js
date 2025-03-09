const User = require('../models/userModel');
const TokenBlacklist = require('../models/tokenBlacklistModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');

const signup = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const newUser = new User({ username, email, password, role });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error signing up' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.status(200).json({ accessToken, refreshToken });
    } catch (err) {
        res.status(500).json({ message: 'Error logging in' });
    }
};

const logout = async (req, res) => {
    try {
        const { accessToken, refreshToken } = req.body;
        if (!accessToken || !refreshToken) return res.status(400).json({ message: 'Tokens required' });

        const blacklistedTokens = [
            { token: accessToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
            { token: refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        ];

        await TokenBlacklist.insertMany(blacklistedTokens);
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error logging out' });
    }
};

module.exports = { signup, login, logout };
