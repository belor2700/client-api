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
    desactiveParClient: !!u.desactiveParClient,
    suppressionDemandeeLe: u.suppressionDemandeeLe || null,
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
    // Canal dedie : savoir en direct qu'un compte vient d'etre cree.
    try { require('../utils/telegram').notifierInscription(u); } catch(e){}
    return res.json({ ok: true, token: sign(u), user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* ============================================================
 * MOT DE PASSE OUBLIE
 *
 * Deux etapes : on envoie un lien par email, puis ce lien permet de choisir
 * un nouveau mot de passe.
 *
 * La reponse de /forgot est TOUJOURS la meme, que le compte existe ou non :
 * sinon la route deviendrait un moyen de savoir quelles adresses sont
 * inscrites chez nous.
 * ============================================================ */
const crypto = require('crypto');
const ResetToken = require('../models/ResetToken');

// POST /api/auth/forgot  { email }
router.post('/forgot', async (req, res) => {
  const reponse = { ok: true, message: 'Si un compte existe avec cette adresse, un email vient de partir.' };
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email || !isEmail(email)) return res.json(reponse);

    const u = await User.findOne({ email });
    if (!u || u.active === false) return res.json(reponse);

    // Un seul lien valable a la fois : les precedents sont neutralises.
    await ResetToken.updateMany(
      { userId: u._id, usedAt: null },
      { usedAt: new Date() }
    );

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await ResetToken.create({
      userId: u._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)   // 1 heure
    });

    const base = (process.env.SITE_BASE || 'https://matulmada.net').replace(/\/+$/, '');
    const lien = base + '/?reset=' + token;
    const { envoyerMail, mailReinitialisation } = require('../utils/mailer');
    const gabarit = mailReinitialisation(lien, (u.name || '').split(' ')[0]);
    // L'envoi ne bloque pas la reponse : un SMTP lent ne doit pas faire
    // patienter le client devant un ecran fige.
    envoyerMail({ to: email, ...gabarit })
      .catch(e => console.error('forgot: envoi mail echoue pour', email, ':', e.message));

    return res.json(reponse);
  } catch (e) {
    console.error('forgot:', e.message);
    return res.json(reponse);   // meme en cas d'erreur interne, pas de fuite
  }
});

// POST /api/auth/reset  { token, password, confirmPassword }
router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    if (!token) return res.status(400).json({ error: 'Lien invalide' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    if (req.body.confirmPassword !== undefined && password !== req.body.confirmPassword)
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rt = await ResetToken.findOne({ tokenHash, usedAt: null });
    if (!rt) return res.status(400).json({ error: 'Lien invalide ou déjà utilisé' });
    if (rt.expiresAt < new Date())
      return res.status(400).json({ error: 'Lien expiré — refaites une demande' });

    const u = await User.findById(rt.userId);
    if (!u) return res.status(400).json({ error: 'Compte introuvable' });

    u.passwordHash = await bcrypt.hash(password, 10);
    await u.save();
    rt.usedAt = new Date();
    await rt.save();

    // Connexion directe : le client vient de prouver qu'il possede l'adresse.
    return res.json({ ok: true, token: sign(u), user: publicUser(u) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/push  { token }   — enregistre l'appareil pour les notifications
router.post('/push', auth, async (req, res) => {
  try {
    const t = String(req.body.token || '').trim();
    if (!t || t.length < 20) return res.status(400).json({ error: 'Jeton invalide' });
    // addToSet plutot que push : reconnecter le meme appareil ne doit pas
    // creer de doublon, sinon le client recoit la notification deux fois.
    await User.updateOne({ _id: req.userId }, { $addToSet: { fcmTokens: t } });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
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

// ───── Securite du compte (cote client) ─────

// POST /api/auth/securite/desactiver   { motif }
// Pause volontaire. Le client garde l'acces : c'est par la qu'il reactive.
router.post('/securite/desactiver', auth, async (req, res) => {
  try {
    const motif = String((req.body || {}).motif || '').trim();
    if (motif.length < 5) return res.status(400).json({ error: 'Motif requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.desactiveParClient = true;
    u.desactiveLe = new Date();
    u.motifDepart = motif;
    u.updatedAt = new Date();
    await u.save();
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/securite/supprimer   { motif }
// Suppression differee : 60 jours pour changer d'avis. Rien n'est efface ici.
router.post('/securite/supprimer', auth, async (req, res) => {
  try {
    const motif = String((req.body || {}).motif || '').trim();
    if (motif.length < 5) return res.status(400).json({ error: 'Motif requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.desactiveParClient = true;
    u.desactiveLe = u.desactiveLe || new Date();
    u.suppressionDemandeeLe = new Date();
    u.motifDepart = motif;
    u.updatedAt = new Date();
    await u.save();
    const fin = new Date(u.suppressionDemandeeLe.getTime() + 60 * 86400000);
    res.json({ ok: true, suppressionLe: fin, user: publicUser(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/securite/reactiver
// Annule la pause ET le compte a rebours de suppression.
router.post('/securite/reactiver', auth, async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.desactiveParClient = false;
    u.desactiveLe = null;
    u.suppressionDemandeeLe = null;
    u.updatedAt = new Date();
    await u.save();
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
