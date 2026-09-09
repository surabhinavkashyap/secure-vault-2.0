const mongoose = require('mongoose')

const vaultEntrySchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  encryptedData: { type: String, required: true },
  iv: { type: String, required: true },
  tag: { type: String, required: true },
  schemaVersion: { type: Number, required: true, default: 1 },
}, { timestamps: true })

module.exports = mongoose.model('VaultEntry', vaultEntrySchema)

