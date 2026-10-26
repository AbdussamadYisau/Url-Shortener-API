const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  urlCode: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true, index: true },
  shortUrl: { type: String, required: true },
  date: { type: String, default: () => new Date().toISOString() },
});
// Preserve the original collection and existing links.
module.exports = mongoose.model('Database', schema);
