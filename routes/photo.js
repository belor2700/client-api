// routes/photo.js — Photo profil via Telegram bot + proxy URL permanent
const express = require('express');
const router = express.Router();

const TG_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT  = process.env.TG_CHAT_ID || '';
const TG_API   = (m) => `https://api.telegram.org/bot${TG_TOKEN}/${m}`;
const TG_FILE  = (p) => `https://api.telegram.org/file/bot${TG_TOKEN}/${p}`;

router.post('/upload', async (req, res) => {
  try {
    if (!TG_TOKEN || !TG_CHAT) return res.status(500).json({ error: 'Telegram non configuré' });
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 requis' });
    const m = String(imageBase64).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Format image invalide' });
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (max 5MB)' });
    const ext = mime.split('/')[1] || 'jpg';
    const fd = new FormData();
    fd.append('chat_id', TG_CHAT);
    fd.append('photo', new Blob([buf], { type: mime }), `profil.${ext}`);
    const r = await fetch(TG_API('sendPhoto'), { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) return res.status(400).json({ error: 'Telegram sendPhoto échec', raw: j });
    const photos = j.result.photo || [];
    const best = photos[photos.length - 1];
    if (!best || !best.file_id) return res.status(400).json({ error: 'file_id introuvable' });
    return res.json({ ok: true, fileId: best.file_id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/:fileId', async (req, res) => {
  try {
    if (!TG_TOKEN) return res.status(500).send('Telegram non configuré');
    const fileId = req.params.fileId;
    const gf = await fetch(TG_API('getFile') + '?file_id=' + encodeURIComponent(fileId));
    const gj = await gf.json();
    if (!gj.ok || !gj.result || !gj.result.file_path) return res.status(404).send('Photo introuvable');
    const img = await fetch(TG_FILE(gj.result.file_path));
    if (!img.ok) return res.status(404).send('Photo indisponible');
    const ct = img.headers.get('content-type') || 'image/jpeg';
    const ab = await img.arrayBuffer();
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(ab));
  } catch (e) { return res.status(500).send('Erreur: ' + e.message); }
});

module.exports = router;
