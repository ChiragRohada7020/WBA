const express = require("express")
const mongoose = require("mongoose")
const bodyParser = require("body-parser")
const path = require("path")
const fs = require("fs")
const dns = require("dns")
const session = require("express-session")
const bcrypt = require("bcrypt")

dns.setServers(["1.1.1.1", "8.8.8.8"])

require("dotenv").config()

const app = express()

// 🔥 IMPORT BOT
const startBot = require("./bot/bot")

// ================= DB =================
mongoose.set("bufferCommands", false)

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("✅ DB Connected")
    } catch (err) {
        console.log("❌ DB Error:", err.message)
        process.exit(1)
    }
}

// ================= MODELS =================
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String
})

const Admin = mongoose.model("Admin", userSchema)
const Birthday = require("./shared/Birthday")

// ================= MIDDLEWARE =================
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))
app.use(bodyParser.urlencoded({ extended: true }))

// ================= AUTH =================
function isLoggedIn(req, res, next) {
    if (req.session.user) return next()
    res.redirect("/login")
}

// ================= ROUTES =================

// HOME
app.get("/", isLoggedIn, async (req, res) => {
    const data = await Birthday.find().sort({ date: 1 })
    res.render("index", { data })
})

// ADD
app.get("/add", isLoggedIn, (req, res) => {
    res.render("add")
})

app.post("/add", isLoggedIn, async (req, res) => {
    const { name, relation, date, jid, number, greeting } = req.body

    const updateData = { source: "web", name, relation, date, jid, number, greeting }

    if (jid) {
        await Birthday.updateOne({ jid }, updateData, { upsert: true })
    } else {
        await Birthday.create(updateData)
    }

    res.redirect("/")
})

// EDIT
app.get("/edit/:id", isLoggedIn, async (req, res) => {
    const item = await Birthday.findById(req.params.id)
    res.render("edit", { item })
})

app.post("/edit/:id", isLoggedIn, async (req, res) => {
    await Birthday.findByIdAndUpdate(req.params.id, req.body)
    res.redirect("/")
})

// DELETE
app.get("/delete/:id", isLoggedIn, async (req, res) => {
    await Birthday.findByIdAndDelete(req.params.id)
    res.redirect("/")
})

// QR API
app.get("/qr", (req, res) => {
    res.json({
        qr: global.botQR,
        status: global.botStatus
    })
})

// ================= PASSWORD =================
app.get("/change-password", isLoggedIn, (req, res) => {
    res.render("change-password")
})

app.post("/change-password", isLoggedIn, async (req, res) => {
    const { currentPassword, newPassword } = req.body

    const user = await Admin.findById(req.session.user)
    if (!user) return res.send("❌ User not found")

    const match = await bcrypt.compare(currentPassword, user.password)
    if (!match) return res.send("❌ Wrong current password")

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await Admin.updateOne(
        { _id: user._id },
        { password: hashedPassword }
    )

    res.send("✅ Password changed successfully")
})

// ================= AUTH ROUTES =================
async function createAdminIfNotExists() {
    const existing = await Admin.findOne({ username: "admin" })

    if (!existing) {
        const hashedPassword = await bcrypt.hash("1234", 10)
        await Admin.create({ username: "admin", password: hashedPassword })
        console.log("✅ Default admin created (admin / 1234)")
    }
}

app.get("/login", (req, res) => res.render("login"))

app.post("/login", async (req, res) => {
    const { username, password } = req.body

    const user = await Admin.findOne({ username })
    if (!user) return res.send("❌ User not found")

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.send("❌ Wrong password")

    req.session.user = user._id
    res.redirect("/")
})

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"))
})

// ================= REFRESH BOT =================
app.get("/refresh", async (req, res) => {
    try {
        console.log("🔄 Refreshing bot...")

        if (global.botInstance) {
            try { global.botInstance.end() } catch {}
        }

        global.botInstance = null
        global.botQR = null

        const authPath = path.join(__dirname, "bot", "auth_info")

        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true })
        }

        await new Promise(r => setTimeout(r, 1000))

        await startBot()

        res.redirect("/")
    } catch (err) {
        console.log("❌ Refresh error:", err)
        res.send("Error refreshing bot")
    }
})

// ================= START APP =================
async function startApp() {
    await connectDB()               // ✅ FIRST DB
    await createAdminIfNotExists()  // ✅ THEN ADMIN
    await startBot()                // ✅ THEN BOT

    app.listen(3000, () => {
        console.log("🚀 Admin Panel: http://localhost:3000")
    })
}

startApp()