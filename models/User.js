const mongoose = require('mongoose');

// Wallet mobile money: opérateur + numéro
const walletSchema = new mongoose.Schema({
  operator: { type: String, enum: ['mvola', 'orange', 'airtel', 'mvola_km'], required: true },
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
  // Compte COMORES: safidiana amin'ny inscription -- Telma Comores irery + devise Fc
  kmAccount:    { type: Boolean, default: false },
  address:      { type: String, default: '' },
  photo:        { type: String, default: '' },
  addressLat:   { type: Number, default: null },
  addressLng:   { type: Number, default: null },
  wallets:      { type: [walletSchema],   default: [] },
  providers:    { type: [providerSchema], default: [] },
  lang:         { type: String, enum: ['fr', 'mg'], default: 'fr' },
  // Jetons Firebase du client : un par appareil (telephone, ordinateur...).
  // Ceux qui deviennent invalides sont retires a l'envoi, pas ici.
  fcmTokens:    { type: [String], default: [] },
  role:         { type: String, default: 'client' },
  active:       { type: Boolean, default: true },
  // Desactivation demandee par LE CLIENT (a distinguer de active:false, qui est
  // une sanction administrative et interdit la connexion). Ici le client peut
  // toujours se connecter : c'est le seul moyen de reactiver son compte.
  desactiveParClient: { type: Boolean, default: false },
  desactiveLe:        { type: Date, default: null },
  // Suppression demandee : le compte est efface automatiquement apres 60 jours
  // si le client ne revient pas. La date sert de compte a rebours.
  suppressionDemandeeLe: { type: Date, default: null },
  motifDepart:           { type: String, default: '' },
  // Annonces deja vues et annonces masquees par CE client : le badge et la
  // liste sont donc propres a chaque compte, pas a l'appareil.
  annoncesLues:    { type: [String], default: [] },
  annoncesMasquees:{ type: [String], default: [] },
  // Suppression DOUCE : le compte disparait des listes mais reste en base, car
  // ses ordres passes doivent rester verifiables.
  deleted:      { type: Boolean, default: false },
  deletedAt:    { type: Date, default: null },
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
