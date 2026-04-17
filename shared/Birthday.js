const mongoose = require("mongoose")

const BirthdaySchema = new mongoose.Schema({
    jid: String,
    name: String,
    relation: String,
    number: String,
    date: String,
    greeting: String,
    source: String,
    lastWishedYear: Number   // 🔥 NEW FIELD
})
module.exports = mongoose.model("Birthday", BirthdaySchema)