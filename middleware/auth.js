const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.userId = payload.id;
    req.userRole = payload.role || 'client';
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
