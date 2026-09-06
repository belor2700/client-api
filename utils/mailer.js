/**
 * Envoi d'emails transactionnels (reinitialisation de mot de passe, plus tard
 * la verification a l'inscription).
 *
 * Passe par le SMTP de Gmail avec un "mot de passe d'application" : gratuit,
 * environ 500 envois par jour, largement au-dessus de nos besoins actuels.
 * Le jour ou ce plafond devient serré, seules les variables changent.
 */
const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;
  const user = (process.env.MAIL_USER || '').trim();
  const pass = (process.env.MAIL_PASS || '').replace(/\s+/g, '');  // Google affiche la cle par groupes de 4
  if (!user || !pass) {
    const e = new Error('Envoi d\'email non configure (MAIL_USER / MAIL_PASS)');
    e.code = 'MailNotConfigured';
    throw e;
  }
  transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
  return transport;
}

async function envoyerMail({ to, subject, html, text }) {
  const t = getTransport();
  const from = process.env.MAIL_FROM || ('MATULMADA <' + process.env.MAIL_USER + '>');
  const info = await t.sendMail({ from, to, subject, html, text });
  console.log('mail envoye ->', to, '|', subject, '|', info.messageId);
  return info;
}

/** Gabarit du lien de reinitialisation. */
function mailReinitialisation(lien, prenom) {
  const nom = prenom ? (' ' + prenom) : '';
  return {
    subject: 'MATULMADA — Réinitialisation de votre mot de passe',
    text: 'Bonjour' + nom + ',\n\n'
        + 'Vous avez demandé à réinitialiser votre mot de passe.\n'
        + 'Ouvrez ce lien pour en choisir un nouveau :\n' + lien + '\n\n'
        + 'Ce lien expire dans 1 heure et ne fonctionne qu\'une fois.\n'
        + 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : '
        + 'votre mot de passe actuel reste valable.\n\n— MATULMADA',
    html: '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a2744">'
        + '<div style="background:linear-gradient(135deg,#1a2744,#0f1b33);padding:24px;border-radius:16px 16px 0 0">'
        + '<div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:.02em">'
        + '<span style="color:#e9ba43">MATUL</span><span style="color:#7fb0ff">MADA</span></div></div>'
        + '<div style="background:#f6f7fb;padding:26px;border-radius:0 0 16px 16px">'
        + '<p style="font-size:16px;margin:0 0 14px">Bonjour' + nom + ',</p>'
        + '<p style="font-size:15px;line-height:1.6;margin:0 0 20px">Vous avez demandé à réinitialiser votre mot de passe. '
        + 'Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>'
        + '<p style="text-align:center;margin:0 0 20px">'
        + '<a href="' + lien + '" style="display:inline-block;background:linear-gradient(150deg,#f2536f,#e63455);'
        + 'color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 30px;border-radius:26px">'
        + 'Choisir un nouveau mot de passe</a></p>'
        + '<p style="font-size:13px;color:#5a6b82;line-height:1.6;margin:0 0 10px">'
        + 'Ce lien expire dans 1 heure et ne fonctionne qu\'une seule fois.</p>'
        + '<p style="font-size:13px;color:#5a6b82;line-height:1.6;margin:0">'
        + 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : '
        + 'votre mot de passe actuel reste valable.</p>'
        + '</div></div>'
  };
}

module.exports = { envoyerMail, mailReinitialisation };
