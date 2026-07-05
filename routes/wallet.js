const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const cleanPhone = (v) => (v || '').replace(/[\s.\-]/g, '');

// ───── Wallets mobile money ─────

// POST /api/wallet  { operator, numero, label? }
router.post('/', async (req, res) => {
  try {
    let { operator, numero, label } = req.body || {};
    operator = (operator || '').toLowerCase();
    numero = cleanPhone(numero);
    if (!['mvola', 'orange', 'airtel'].includes(operator))
      return res.status(400).json({ error: 'Opérateur invalide' });
    if (!numero) return res.status(400).json({ error: 'Numéro requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.wallets.push({ operator, numero, label: label || '' });
    u.updatedAt = new Date();
    await u.save();
    return res.json({ ok: true, wallets: u.wallets });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// DELETE /api/wallet/:id
router.delete('/:id', async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.wallets = u.wallets.filter(w => String(w._id) !== req.params.id);
    u.updatedAt = new Date();
    await u.save();
    return res.json({ ok: true, wallets: u.wallets });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ───── Fournisseurs (Deriv, etc.) ─────

// POST /api/wallet/provider  { name, accountId, label? }
router.post('/provider', async (req, res) => {
  try {
    const { name, accountId, label, email } = req.body || {};
    if (!name || !accountId) return res.status(400).json({ error: 'Nom et identifiant requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.providers.push({ name, accountId, label: label || '', email: email || '' });
    u.updatedAt = new Date();
    await u.save();
    return res.json({ ok: true, providers: u.providers });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// DELETE /api/wallet/provider/:id
router.delete('/provider/:id', async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.providers = u.providers.filter(p => String(p._id) !== req.params.id);
    u.updatedAt = new Date();
    await u.save();
    return res.json({ ok: true, providers: u.providers });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;
