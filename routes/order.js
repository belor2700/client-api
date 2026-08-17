const express = require('express');
const ClientOrder = require('../models/ClientOrder');
const auth = require('../middleware/auth');
const { coreCreateOrder, coreGetOrder } = require('../utils/coreApi');

const router = express.Router();
router.use(auth);

const PAYMENT_BASE = () => (process.env.PAYMENT_WEBVIEW_BASE || 'https://payment-webview.vercel.app').replace(/\/$/, '');

const FINAL = ['success', 'failed'];

// Synchronise un ordre client depuis le core (statut + session + n° passerelle).
// Renvoie true si quelque chose a changé.
async function syncFromCore(order) {
  if (!order || !order.coreOrderId || FINAL.includes(order.status)) return false;
  try {
    const core = await coreGetOrder(order.coreOrderId);
    if (!core) return false;
    let changed = false;
    if (core.status && core.status !== order.status) { order.status = core.status; changed = true; }
    const sess = core.session || core.sessionId || core.session_id || '';
    if (sess && sess !== order.session) { order.session = sess; changed = true; }
    const gw = core.gatewayNumero || core.gateway || '';
    if (gw && gw !== order.gatewayNumero) { order.gatewayNumero = gw; changed = true; }
    if (changed) { order.updatedAt = new Date(); await order.save(); }
    return changed;
  } catch (_) { return false; } // core indisponible : on garde le dernier statut connu
}

// POST /api/order  { type, operator, montant, numero, provider?, providerId? }
// → crée l'ordre dans le backend core, enregistre l'ordre client, renvoie l'URL WebView.
router.post('/', async (req, res) => {
  try {
    let { type, operator, montant, numero, provider, providerId } = req.body || {};
    type = (type || '').toLowerCase();
    operator = (operator || '').toLowerCase();
    // VIRGULE: "1,50" -> 1.50 (saisie FR)
    montant = Number(String(montant).replace(/\s/g, "").replace(",", "."));
    numero = (numero || '').replace(/[\s.\-]/g, '');

    if (!['depot', 'retrait'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
    if (!['mvola', 'orange', 'airtel', 'mvola_km'].includes(operator)) return res.status(400).json({ error: 'Opérateur invalide' });
    // Compte Comores: Telma Comores (mvola_km) IRERY ; compte Madagascar: tsy mvola_km
    try {
      const User = require('../models/User');
      const u = await User.findById(req.userId).select('kmAccount').lean();
      if (u && u.kmAccount && operator !== 'mvola_km')
        return res.status(400).json({ error: 'Compte Comores: seul Telma Comores est disponible' });
      if (u && !u.kmAccount && operator === 'mvola_km')
        return res.status(400).json({ error: 'Opérateur réservé aux comptes Comores' });
    } catch(eU) {}
    if (!montant || montant < 1) return res.status(400).json({ error: 'Montant invalide' });
    if (!numero) return res.status(400).json({ error: 'Numéro requis' });

    // 1) Créer dans le core (alimente WebView + admin + auto-validation)
    const core = await coreCreateOrder({ operator, numero, montant, type, clientId: String(req.userId), provider: provider||'', providerId: providerId||'' });

    // 2) Enregistrer côté client
    const order = await ClientOrder.create({
      userId: req.userId, type, operator, montant, numero,
      provider: provider || '', providerId: providerId || '',
      coreOrderId: core.id, ussdCode: core.ussdCode || '', status: 'pending',
      payUrl: core.payUrl || '', payMode: core.payMode || ''
    });

    // 3) Deux chemins possibles pour le paiement :
    //    - payUrl  : le core a ouvert un paiement Orange Money (API). Le client
    //      est envoye directement chez Orange, il n'y a AUCUN code a composer,
    //      donc pas de WebView de paiement. Aucun jeton Orange ne passe ici :
    //      payUrl est une url du core qui redirige cote serveur.
    //    - webviewUrl : chemin habituel (code USSD affiche dans le WebView).
    //      C'est aussi le repli automatique quand l'API Orange n'a pas repondu.
    const webviewUrl = `${PAYMENT_BASE()}/?order=${core.id}&client=${order._id}`;
    const payUrl = core.payUrl || '';

    return res.json({
      ok: true,
      orderId: order._id,
      coreOrderId: core.id,
      ussdCode: core.ussdCode,
      channel: core.channel,
      webviewUrl,
      payUrl,
      payMode: core.payMode || (payUrl ? 'orange_api' : 'ussd')
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
});

// GET /api/order  → historique du client (avec sync auto des ordres non finalisés)
router.get('/', async (req, res) => {
  try {
    const list = await ClientOrder.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
    // Sync depuis le core uniquement les ordres encore en cours (pending/processing)
    const pending = list.filter(o => o.coreOrderId && !FINAL.includes(o.status));
    if (pending.length) {
      await Promise.all(pending.map(o => syncFromCore(o).catch(() => false)));
    }
    return res.json({ data: list });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /api/order/:id/status  → proxy du statut depuis le core (sync local)
router.get('/:id/status', async (req, res) => {
  try {
    const order = await ClientOrder.findOne({ _id: req.params.id, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Ordre introuvable' });
    await syncFromCore(order);
    return res.json({
      status: order.status, montant: order.montant, type: order.type,
      session: order.session, ussdCode: order.ussdCode,
      // Permet a la vitrine de reprendre un paiement Orange non termine sans
      // recreer un ordre (donc sans risque de double paiement).
      payUrl: order.payUrl || '', payMode: order.payMode || ''
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /api/order/record-retrait
// Enregistre un retrait Deriv DEJA execute dans le core (flux OAuth : le retrait
// est cree cote core par /api/retrait/deriv-withdraw, PAS via POST /api/order).
// On cree seulement le ClientOrder pour l'historique, SANS recreer l'ordre core
// (donc AUCUNE duplication). Le coreOrderId permet la sync de statut ulterieure.
router.post('/record-retrait', async (req, res) => {
  try {
    let { operator, montant, numero, provider, providerId, coreOrderId } = req.body || {};
    operator = (operator || '').toLowerCase();
    montant = Number(String(montant).replace(/\s/g, '').replace(',', '.'));
    numero = (numero || '').replace(/[\s.\-]/g, '');
    if (!['mvola', 'orange', 'airtel', 'mvola_km'].includes(operator))
      return res.status(400).json({ error: 'Operateur invalide' });
    if (!montant || montant < 1) return res.status(400).json({ error: 'Montant invalide' });
    if (!numero) return res.status(400).json({ error: 'Numero requis' });
    // Anti-doublon : si ce retrait core est deja enregistre pour ce client, on renvoie l'existant.
    if (coreOrderId) {
      const existing = await ClientOrder.findOne({ userId: req.userId, coreOrderId: String(coreOrderId) });
      if (existing) return res.json({ ok: true, orderId: existing._id, already: true });
    }
    const order = await ClientOrder.create({
      userId: req.userId, type: 'retrait', operator, montant, numero,
      provider: provider || 'Deriv', providerId: providerId || '',
      coreOrderId: coreOrderId ? String(coreOrderId) : '', status: 'pending'
    });
    return res.json({ ok: true, orderId: order._id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;
