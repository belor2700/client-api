const mongoose = require('mongoose');

// Ordre passé par un client. Référence l'ordre créé dans le backend "core"
// (celui qui alimente le WebView + admin + auto-validation).
const clientOrderSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:        { type: String, enum: ['depot', 'retrait'], required: true },
  operator:    { type: String, enum: ['mvola', 'orange', 'airtel'], required: true },
  montant:     { type: Number, required: true, min: 1 },
  numero:      { type: String, required: true },   // numéro du wallet client
  provider:    { type: String, default: '' },      // ex: "Deriv"
  providerId:  { type: String, default: '' },      // ID fournisseur
  coreOrderId: { type: String, default: '' },      // _id de l'ordre dans le backend core
  ussdCode:    { type: String, default: '' },
  session:     { type: String, default: '' },       // n° de session renvoyé par le WebView/core
  gatewayNumero:{ type: String, default: '' },      // numéro passerelle (pour dépôt)
  status:      { type: String, enum: ['pending', 'processing', 'success', 'failed'], default: 'pending' },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
}, { collection: 'client_orders' });

module.exports = mongoose.model('ClientOrder', clientOrderSchema);
