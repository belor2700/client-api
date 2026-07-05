# MATUL MAD — Backend Client (matulmad-client-api)

API espace client : inscription/connexion (email ou téléphone), wallets mobile money,
fournisseurs (Deriv...), et création d'ordres (pont vers le backend core → WebView + admin).

## Endpoints
- `POST /api/auth/register` { name?, email?, phone?, password, lang? }
- `POST /api/auth/login`    { identifier (email|phone), password }
- `GET  /api/auth/me`       (Bearer)
- `PATCH /api/auth/me`      { name?, lang? }
- `POST /api/wallet`        { operator, numero, label? }
- `DELETE /api/wallet/:id`
- `POST /api/wallet/provider` { name, accountId, label? }
- `DELETE /api/wallet/provider/:id`
- `POST /api/order`         { type, operator, montant, numero, provider?, providerId? } → { webviewUrl }
- `GET  /api/order`         historique
- `GET  /api/order/:id/status`

## Variables d'environnement (Render)
- `MONGO_URI`     : LA MÊME base que le backend existant (collection `users` séparée)
- `JWT_SECRET`    : longue chaîne aléatoire
- `CORE_API_BASE` : https://sms-gateway-admin-backend-vw8p.onrender.com
- `CORE_API_TOKEN`: JWT admin/service du backend core
- `PAYMENT_WEBVIEW_BASE` : https://payment-webview.vercel.app

## Déploiement Render
1. Pusher ce repo sur GitHub.
2. Render → New Web Service → connecter le repo.
3. Build: `npm install` · Start: `node index.js`
4. Définir les variables d'environnement ci-dessus.
