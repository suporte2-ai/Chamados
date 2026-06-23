function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.has(key)) {
      return res.status(403).json({ error: 'Permissão insuficiente.' });
    }
    next();
  };
}

module.exports = requirePermission;
