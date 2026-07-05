// Pont vers le backend "core" (celui qui alimente le WebView + admin + auto-validation).
// Configuré via variables d'environnement :
//   CORE_API_BASE   ex: https://sms-gateway-admin-backend-vw8p.onrender.com
//   CORE_API_TOKEN  JWT admin/service du backend core (pour créer/lire les ordres)

const BASE = () => (process.env.CORE_API_BASE || '').replace(/\/$/, '');
const TOKEN = () => process.env.CORE_API_TOKEN || '';

/* fetch résilient au COLD START Render (free plan mifoha ~30-60s):
 *  - 3 essais, timeouts progressifs (20s / 35s / 50s)
 *  - retry uniquement sur erreur réseau / timeout / 5xx-502
 *  - les 4xx (erreurs métier) ne sont PAS retentés */
async function coreFetch(path, options = {}, { retries = 3, timeouts = [20000, 35000, 50000] } = {}) {
  if (!BASE() || !TOKEN()) throw new Error('CORE_API_BASE / CORE_API_TOKEN non configurés');
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeouts[Math.min(attempt, timeouts.length - 1)]);
    try {
      const r = await fetch(BASE() + path, {
        ...options,
        headers: { 'Authorization': 'Bearer ' + TOKEN(), ...(options.headers || {}) },
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (r.status >= 500 || r.status === 429) { // core en réveil / surchargé
        lastErr = new Error('core ' + r.status);
      } else {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(data.error || ('core ' + r.status)), { noRetry: true });
        return data;
      }
    } catch (e) {
      clearTimeout(timer);
      if (e.noRetry) throw e;
      lastErr = e.name === 'AbortError' ? new Error('core timeout (cold start?)') : e;
    }
    if (attempt < retries - 1) await new Promise(r2 => setTimeout(r2, 2000 * (attempt + 1)));
  }
  throw lastErr || new Error('core injoignable');
}

async function coreCreateOrder({ operator, numero, montant, type, clientId, provider, providerId }) {
  // clientRef = clé d'idempotence : raha retry (cold start) dia tsy miverina
  // indroa ny ordre — ny core mamerina ilay efa voaforona.
  const clientRef = require('crypto').randomUUID();
  return coreFetch('/api/retrait', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator, numero, montant, type, clientId, provider, providerId, clientRef })
  }); // { ok, id, ussdCode, channel }
}

async function coreGetOrder(id) {
  return coreFetch('/api/retrait/' + id);
}

module.exports = { coreCreateOrder, coreGetOrder, BASE, TOKEN };
