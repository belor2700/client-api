/**
 * Gestion des comptes clients depuis le panneau d'administration.
 *
 * Ces routes lisent et modifient TOUS les comptes : elles ne sont donc pas
 * protegees par le jeton d'un client, mais par une cle dediee (ADMIN_API_KEY),
 * transmise dans l'en-tete x-admin-key. Un jeton client, meme valide, ne donne
 * aucun acces ici.
 *
 * Aucune de ces routes ne renvoie le mot de passe : le schema ne stocke qu'un
 * hachage, et publicAdminUser ne l'expose pas.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');

const router = express.Router();

// --- Garde d'acces --------------------------------------------------------
function adminKey(req, res, next) {
  const cle = process.env.ADMIN_API_KEY || '';
  // Sans cle configuree, la porte reste fermee : mieux vaut une fonction
  // indisponible qu'une liste de comptes ouverte a tous.
  if (!cle) return res.status(503).json({ error: 'ADMIN_API_KEY non configuree' });
  const fournie = req.headers['x-admin-key'] || '';
  if (fournie !== cle) return res.status(401).json({ error: 'Cle admin invalide' });
  next();
}

function publicAdminUser(u) {
  return {
    id: u._id, name: u.name || '', email: u.email || null, phone: u.phone || null,
    country: u.country || '', address: u.address || '',
    kmAccount: !!u.kmAccount, lang: u.lang || 'fr',
    active: u.active !== false, role: u.role || 'client',
    photo: u.photo || '',
    walletsCount: (u.wallets || []).length,
    providersCount: (u.providers || []).length,
    providers: (u.providers || []).map(p => ({ name: p.name, accountId: p.accountId, label: p.label || '' })),
    createdAt: u.createdAt || null
  };
}

// GET /api/admin/users?q=&page=&limit=&active=
router.get('/users', adminKey, async (req, res) => {
  try {
    const q      = String(req.query.q || '').trim();
    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const filtre = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtre.$or = [{ name: rx }, { email: rx }, { phone: rx }, { address: rx }];
    }
    if (req.query.active === 'true')  filtre.active = { $ne: false };
    if (req.query.active === 'false') filtre.active = false;

    const total = await User.countDocuments(filtre);
    const docs  = await User.find(filtre)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ ok: true, total, page, limit, users: docs.map(publicAdminUser) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users/:id
router.get('/users/:id', adminKey, async (req, res) => {
  try {
    const u = await User.findById(req.params.id).lean();
    if (!u) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ ok: true, user: publicAdminUser(u), wallets: u.wallets || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', adminKey, async (req, res) => {
  try {
    const maj = {};
    // Liste blanche : seuls ces champs sont modifiables. Le hachage du mot de
    // passe, les portefeuilles et les fournisseurs ne passent jamais par ici.
    for (const k of ['name', 'country', 'address', 'lang']) {
      if (typeof req.body[k] === 'string') maj[k] = req.body[k].trim();
    }
    if (typeof req.body.active === 'boolean')    maj.active = req.body.active;
    if (typeof req.body.kmAccount === 'boolean') maj.kmAccount = req.body.kmAccount;

    if (typeof req.body.email === 'string') {
      const em = req.body.email.toLowerCase().trim();
      if (em) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
          return res.status(400).json({ error: 'Email invalide' });
        const pris = await User.findOne({ email: em, _id: { $ne: req.params.id } });
        if (pris) return res.status(409).json({ error: 'Email deja utilise' });
      }
      maj.email = em || undefined;
    }
    if (typeof req.body.phone === 'string') {
      const ph = req.body.phone.replace(/[^0-9+]/g, '').trim();
      if (ph) {
        const pris = await User.findOne({ phone: ph, _id: { $ne: req.params.id } });
        if (pris) return res.status(409).json({ error: 'Telephone deja utilise' });
      }
      maj.phone = ph || undefined;
    }

    const u = await User.findByIdAndUpdate(req.params.id, maj, { new: true }).lean();
    if (!u) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ ok: true, user: publicAdminUser(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/users/:id/password  { password }
router.post('/users/:id/password', adminKey, async (req, res) => {
  try {
    const mdp = String(req.body.password || '');
    if (mdp.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    const hash = await bcrypt.hash(mdp, 10);
    const u = await User.findByIdAndUpdate(req.params.id, { passwordHash: hash }, { new: true }).lean();
    if (!u) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
