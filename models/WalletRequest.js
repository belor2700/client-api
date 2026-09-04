const mongoose = require('mongoose');

/**
 * Demande de MODIFICATION ou de SUPPRESSION d'un wallet.
 *
 * L'ajout d'un wallet reste immediat : un client ne peut avoir qu'un seul
 * wallet par operateur, donc ajouter ne permet pas de contourner le controle.
 * En revanche modifier ou supprimer changerait le numero qui recoit l'argent :
 * ces deux operations passent par une validation de l'administrateur, et
 * l'ancien wallet continue de fonctionner tant que rien n'est valide.
 */
const walletRequestSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, enum: ['modification', 'suppression'], required: true },
  walletId:  { type: String, required: true },
  ancien:    { operator: String, numero: String, label: String },
  nouveau:   { operator: String, numero: String, label: String },
  statut:    { type: String, enum: ['en_attente', 'approuve', 'refuse'], default: 'en_attente', index: true },
  motif:     { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  decidedAt: { type: Date, default: null },
  decidedBy: { type: String, default: '' }
}, { collection: 'wallet_requests' });

module.exports = mongoose.model('WalletRequest', walletRequestSchema);
