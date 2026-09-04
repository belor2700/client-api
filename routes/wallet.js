const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const cleanPhone = (v) => (v || '').replace(/[\s.\-]/g, '');

// ───── Wallets mobile money ─────

// POST /api/wallet  { operator, numero, label? }
// Prefixes par operateur. Un numero Orange saisi comme wallet Telma enverrait
// l'argent vers un compte inexistant : le controle se fait donc cote serveur,
// pas seulement dans le formulaire. Les Comores ne sont pas contraintes.
const PREFIXES = { mvola: ['034', '038'], orange: ['032', '037'], airtel: ['033'] };
function prefixeValide(operator, numero) {
  const p = PREFIXES[operator];
  if (!p) return true;                       // mvola_km : aucune contrainte
  return p.some(x => String(numero).startsWith(x));
}

router.post('/', async (req, res) => {
  try {
    let { operator, numero, label } = req.body || {};
    operator = (operator || '').toLowerCase();
    numero = cleanPhone(numero);
    if (!['mvola', 'orange', 'airtel', 'mvola_km'].includes(operator))
      return res.status(400).json({ error: 'Opérateur invalide' });
    if (!numero) return res.status(400).json({ error: 'Numéro requis' });
    if (!prefixeValide(operator, numero))
      return res.status(400).json({ error: 'Numero incompatible avec l operateur ('
        + (PREFIXES[operator] || []).join(' ou ') + ')' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    // Un seul wallet par operateur : sinon l'ajout, libre, permettrait de
    // contourner la validation exigee pour une modification.
    if ((u.wallets || []).some(w => w.operator === operator))
      return res.status(409).json({ error: 'Un wallet existe deja pour cet operateur. Modifiez-le.' });
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
    const w = (u.wallets || []).find(x => String(x._id) === req.params.id);
    if (!w) return res.status(404).json({ error: 'Wallet introuvable' });
    const WalletRequest = require('../models/WalletRequest');
    const dejaLa = await WalletRequest.findOne({ userId: u._id, walletId: req.params.id, statut: 'en_attente' });
    if (dejaLa) return res.status(409).json({ error: 'Une demande est deja en attente pour ce wallet', demande: dejaLa });
    const dem = await WalletRequest.create({
      userId: u._id, type: 'suppression', walletId: req.params.id,
      ancien: { operator: w.operator, numero: w.numero, label: w.label || '' }
    });
    // Le wallet reste actif tant que l'administrateur n'a pas tranche.
    return res.json({ ok: true, demande: dem, wallets: u.wallets });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// PATCH /api/wallet/:id  { numero, label? }
// Ne modifie RIEN : cree une demande. L'ancien numero continue de recevoir
// l'argent tant que l'administrateur n'a pas valide.
router.patch('/:id', async (req, res) => {
  try {
    const numero = cleanPhone((req.body || {}).numero);
    const label  = ((req.body || {}).label || '').trim();
    if (!numero) return res.status(400).json({ error: 'Numéro requis' });
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const w = (u.wallets || []).find(x => String(x._id) === req.params.id);
    if (!w) return res.status(404).json({ error: 'Wallet introuvable' });
    if (!prefixeValide(w.operator, numero))
      return res.status(400).json({ error: 'Numero incompatible avec l operateur ('
        + (PREFIXES[w.operator] || []).join(' ou ') + ')' });
    if (w.numero === numero && (w.label || '') === label)
      return res.status(400).json({ error: 'Aucun changement' });
    const WalletRequest = require('../models/WalletRequest');
    const dejaLa = await WalletRequest.findOne({ userId: u._id, walletId: req.params.id, statut: 'en_attente' });
    if (dejaLa) return res.status(409).json({ error: 'Une demande est deja en attente pour ce wallet', demande: dejaLa });
    const dem = await WalletRequest.create({
      userId: u._id, type: 'modification', walletId: req.params.id,
      ancien:  { operator: w.operator, numero: w.numero, label: w.label || '' },
      nouveau: { operator: w.operator, numero: numero, label: label }
    });
    return res.json({ ok: true, demande: dem, wallets: u.wallets });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /api/wallet/demandes — les demandes en attente du client connecte
router.get('/demandes', async (req, res) => {
  try {
    const WalletRequest = require('../models/WalletRequest');
    const l = await WalletRequest.find({ userId: req.userId, statut: 'en_attente' }).lean();
    return res.json({ ok: true, demandes: l });
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
