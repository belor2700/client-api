const mongoose = require('mongoose');

/**
 * Jeton de reinitialisation de mot de passe.
 *
 * Seul le HACHAGE du jeton est stocke : meme avec un acces a la base, on ne
 * peut pas reconstituer le lien envoye au client. Le jeton expire au bout
 * d'une heure et devient inutilisable des qu'il a servi.
 */
const resetTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt:    { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Menage automatique : MongoDB supprime le document une fois la date passee.
resetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ResetToken', resetTokenSchema);
