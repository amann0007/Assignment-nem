const hasRole = (role) => (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ message: `${role} access required` });
    next();
};

module.exports = hasRole;
