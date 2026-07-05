const mongoose = require('mongoose');

// Wallet mobile money: opérateur + numéro
const walletSchema = new mongoose.Schema({
  operator: { type: String, enum: ['mvola', 'orange', 'airtel'], required: true },
  numero:   { type: String, required: true },
  label:    { type: String, default: '' }
}, { _id: true });

// Compte fournisseur externe (ex: Deriv) : nom + identifiant
const providerSchema = new mongoose.Schema({
  name:      { type: String, required: true },   // ex: "Deriv"
  accountId: { type: String, required: true },   // ID fournisseur (CR...)
  label:     { type: String, default: '' },
  email:     { type: String, default: '' }
}, { _id: true });

const userSchema = new mongoose.Schema({
  name:         { type: String, default: '' },
  email:        { type: String, lowercase: true, trim: true, sparse: true, index: true },
  phone:        { type: String, trim: true, sparse: true, index: true },
  passwordHash: { type: String, required: true },
  // FIX: Adresse + Pays + coordonnees GPS (Point exact via Maps)
  country:      { type: String, default: 'Madagascar' },
  address:      { type: String, default: '' },
  addressLat:   { type: Number, default: null },
  addressLng:   { type: Number, default: null },
  wallets:      { type: [walletSchema],   default: [] },
  providers:    { type: [providerSchema], default: [] },
  lang:         { type: String, enum: ['fr', 'mg'], default: 'fr' },
  role:         { type: String, default: 'client' },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now }
}, { collection: 'client_users' });

// Au moins email OU phone
userSchema.pre('validate', function (next) {
  if (!this.email && !this.phone) {
    return next(new Error('Email ou téléphone requis'));
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
