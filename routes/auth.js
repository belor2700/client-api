const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const SECRET = () => process.env.JWT_SECRET || 'dev_secret_change_me';
const sign = (u) => jwt.sign(
  { id: u._id, role: u.role || 'client' },
  SECRET(),
  { expiresIn: '30d' }
);

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const cleanPhone = (v) => (v || '').replace(/[\s.\-]/g, '');

function publicUser(u) {
  return {
    annoncesLues: u.annoncesLues || [],
    annoncesMasquees: u.annoncesMasquees || [],
    id: u._id, name: u.name, email: u.email || null, phone: u.phone || null,
    // FIX: adresse/pays/coordonnees visibles ao amin'ny profile client
    country: u.country || 'Madagascar',
    address: u.address || '',
    photo: u.photo || '',
    addressLat: u.addressLat ?? null,
    addressLng: u.addressLng ?? null,
    kmAccount: !!u.kmAccount,
    wallets: u.wallets, providers: u.providers, lang: u.lang, role: u.role
  };
}

// POST /api/auth/register  { name, email?, phone?, password, confirmPassword,
//   country?, address?, addressLat?, addressLng? }
router.post('/register', async (req, res) => {
  try {
    let { name, email, phone, password, confirmPassword, lang,
          country, address, addressLat, addressLng, photo, kmAccount } = req.body || {};
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    // FIX: confirmation mot de passe -- verifiee cote serveur aussi
    if (confirmPassword !== undefined && password !== confirmPassword)
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });

    email = (email || '').toLowerCase().trim() || undefined;
    phone = cleanPhone(phone) || undefined;
    if (!email && !phone) return res.status(400).json({ error: 'Email ou téléphone requis' });
    if (email && !isEmail(email)) return res.status(400).json({ error: 'Email invalide' });

    // Unicité
    const exists = await User.findOne({ $or: [
      ...(email ? [{ email }] : []),
      ...(phone ? [{ phone }] : [])
    ] });
    if (exists) return res.status(409).json({ error: 'Compte déjà existant' });

    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({
      name: name || '', email, phone, passwordHash,
      lang: lang === 'mg' ? 'mg' : 'fr',
      country: (typeof country === 'string' && country.trim()) ? country.trim() : 'Madagascar',
      address: address || '',
      addressLat: (typeof addressLat === 'number') ? addressLat : null,
      addressLng: (typeof addressLng === 'number') ? addressLng : null,
      photo: (typeof photo === 'string') ? photo : '',
      // Compte pour Comores (Fc / Telma Comores irery)
      kmAccount: kmAccount === true || kmAccount === 'true' || kmAccount === 1
    });
    return res.json({ ok: true, token: sign(u), user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login  { identifier (email|phone), password }
router.post('/login', async (req, res) => {
  try {
    let { identifier, email, phone, password } = req.body || {};
    const id = identifier || email || phone;
    if (!id || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    const query = isEmail(id)
      ? { email: id.toLowerCase().trim() }
      : { phone: cleanPhone(id) };
    const u = await User.findOne(query);
    if (!u) return res.status(401).json({ error: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    if (!u.active) return res.status(403).json({ error: 'Compte désactivé' });
    return res.json({ ok: true, token: sign(u), user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    return res.json({ user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PATCH /api/auth/me  { name?, email?, phone?, country?, address?, lang? }
router.patch('/me', auth, async (req, res) => {
  try {
    const { name, email, phone, country, address, lang, photo } = req.body || {};
    const upd = { updatedAt: new Date() };
    if (typeof name === 'string') upd.name = name.trim();
    if (typeof country === 'string') upd.country = country.trim();
    if (typeof address === 'string') upd.address = address.trim();
    if (typeof photo === 'string') upd.photo = photo;
    if (lang === 'fr' || lang === 'mg') upd.lang = lang;
    if (typeof email === 'string') {
      const e = email.toLowerCase().trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Email invalide' });
      if (e) {
        const dup = await User.findOne({ email: e, _id: { $ne: req.userId } });
        if (dup) return res.status(409).json({ error: 'Email déjà utilisé' });
      }
      upd.email = e || undefined;
    }
    if (typeof phone === 'string') {
      const p = phone.replace(/[\s.\-]/g, '');
      if (p) {
        const dup = await User.findOne({ phone: p, _id: { $ne: req.userId } });
        if (dup) return res.status(409).json({ error: 'Téléphone déjà utilisé' });
      }
      upd.phone = p || undefined;
    }
    const u = await User.findByIdAndUpdate(req.userId, upd, { new: true, runValidators: true });
    return res.json({ ok: true, user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/annonces/lues   { ids: [] }
// Marque des annonces comme vues : le point rouge disparait.
router.post('/annonces/lues', auth, async (req, res) => {
  try {
    const ids = (req.body || {}).ids || [];
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids invalide' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const set = new Set([...(u.annoncesLues || []), ...ids.map(String)]);
    u.annoncesLues = [...set].slice(-300);
    u.updatedAt = new Date();
    await u.save();
    res.json({ ok: true, lues: u.annoncesLues });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/annonces/masquer   { id }
// Masque une annonce pour CE client uniquement : les autres la voient encore.
router.post('/annonces/masquer', auth, async (req, res) => {
  try {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'id requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!(u.annoncesMasquees || []).includes(id)) u.annoncesMasquees.push(id);
    u.updatedAt = new Date();
    await u.save();
    res.json({ ok: true, masquees: u.annoncesMasquees });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
