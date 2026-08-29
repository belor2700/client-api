require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Santé
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'matulmad-client-api', version: '1.0.0' }));
// Keepalive UptimeRobot — leger, sans DB
app.get('/keepalive', (req, res) => res.json({ alive: true, uptime: process.uptime() }));
app.get('/ping', (req, res) => res.status(200).send('pong'));

/* ANTI-SLEEP RENDER : self-ping (RENDER_EXTERNAL_URL auto) + cross-ping
 * (PEER_PING_URLS = URL du backend core, separees par virgules). */
const SELF_URL  = (process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const PEER_URLS = (process.env.PEER_PING_URLS || process.env.CORE_API_BASE || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
async function pingUrl(url, label) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url + '/keepalive', { signal: ctrl.signal });
    if (!r.ok) console.error(`[keepalive] ${label} HTTP ${r.status}`);
  } catch (e) {
    console.error(`[keepalive] ${label} echec:`, e.name === 'AbortError' ? 'timeout' : e.message);
  } finally { clearTimeout(t); }
}
(function startKeepalivePings() {
  const run = () => {
    if (SELF_URL) pingUrl(SELF_URL, 'self');
    PEER_URLS.forEach((u, i) => setTimeout(() => pingUrl(u, 'peer:' + u), 2000 * (i + 1)));
  };
  setInterval(run, 10 * 60 * 1000 + Math.floor(Math.random() * 30000));
  setTimeout(run, 15000);
  console.log('[keepalive] self:', SELF_URL || '(non configure)', '| peers:', PEER_URLS.length);
})();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/order', require('./routes/order'));
app.use('/api/photo', require('./routes/photo'));
// Gestion des comptes depuis l'admin : protegee par ADMIN_API_KEY, pas par un
// jeton client (voir routes/admin.js).
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));

const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO) {
  console.error('MONGO_URI manquant');
  process.exit(1);
}

mongoose.connect(MONGO)
  .then(() => {
    console.log('MongoDB connecté');
    app.listen(PORT, () => console.log('matulmad-client-api on :' + PORT));
  })
  .catch((e) => { console.error('Mongo error:', e.message); process.exit(1); });
