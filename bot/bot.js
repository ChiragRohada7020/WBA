const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

require("dotenv").config()
const dns = require("dns")
dns.setServers(["1.1.1.1","8.8.8.8"])

const mongoose = require("mongoose")
const cron = require("node-cron")
const Groq = require("groq-sdk")
const path = require("path")

const Birthday = require("../shared/Birthday")

// 🔐 AI APInpm install dotenv
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY // 🔥 replace
})

// 🔌 DB
// mongodb+srv://ChiragRohada:s54icYoW4045LhAW@atlascluster.t7vxr4g.mongodb.net/whatsapp_ai

global.botQR = null

// 📅 TODAY
function todayDate() {
    const d = new Date()
    const day = String(d.getDate()).padStart(2, "0")
    const month = String(d.getMonth() + 1).padStart(2, "0")
    return `${day}-${month}`
}

// 🎯 CHECK BIRTHDAY
function isBirthdayWish(text) {
    const t = text.toLowerCase()
    return t.includes("birthday") || t.includes("hbd") || t.includes("janamdin")
}

// 🤖 AI: GENERATE WISH
async function generateBirthdayWish(name, greeting, relation) {

    const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Write a VERY SHORT birthday wish:

- Max 1 line
- Hinglish
- Tone based on relation
`
            },
            {
                role: "user",
                content: `
Name: ${name || "bhai"}
Relation: ${relation || "friend"}
Base: ${greeting || "Happy birthday"}
`
            }
        ]
    })

    return res.choices[0].message.content
}


// 🔥 NUMBER EXTRACTION (FINAL)
function extractPhone(msg) {
    let number = null

    // 🥇 senderPn (incoming best case)
    if (msg.key?.senderPn?.includes("@s.whatsapp.net")) {
        number = msg.key.senderPn
    }

    // 🥈 participantPn (groups)
    if (!number && msg.key?.participantPn?.includes("@s.whatsapp.net")) {
        number = msg.key.participantPn
    }

    // 🥉 direct JID
    if (!number && msg.key?.remoteJid?.includes("@s.whatsapp.net")) {
        number = msg.key.remoteJid
    }

    // 🏅 peer fallback
    if (
        !number &&
        msg?.message?.peerDataOperationRequestResponseMessage?.peer_recipient_pn
    ) {
        number =
            msg.message.peerDataOperationRequestResponseMessage.peer_recipient_pn
    }

    // ❌ if still not found
    if (!number) return null

    // 🔧 CLEAN NUMBER
    number = number.split("@")[0]        // remove @s.whatsapp.net
    number = number.replace(/\D/g, "")  // digits only

    // 🇮🇳 remove +91 if extra
    if (number.startsWith("91") && number.length > 10) {
        number = number.slice(2)
    }

    return number
}

// 🚀 START BOT
let sock



async function start() {

    // 🔥 AUTH PATH FIX
    const AUTH_PATH = path.join(__dirname, "auth_info")
    console.log("📂 AUTH PATH:", AUTH_PATH)

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH)

    // 🔥 VERSION FIX
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        browser: ["Windows", "Chrome", "120"],
        printQRInTerminal: false
    })

    global.botInstance = sock

    sock.ev.on("creds.update", saveCreds)
    // ================= CONNECTION =================
   global.botStatus = "connecting"
sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect, qr } = update

    if (qr) {
        const QRCode = require("qrcode")
        global.botQR = await QRCode.toDataURL(qr)
        global.botStatus = "qr"
        console.log("📲 QR GENERATED")
    }

    if (connection === "open") {
        global.botQR = null
        global.botStatus = "connected"
        console.log("✅ CONNECTED")
    }

    if (connection === "close") {
        console.log("❌ CLOSED")

        const reason = lastDisconnect?.error?.output?.statusCode

        console.log("🔍 Disconnect reason:", reason)

        // 🔥 AUTO RESTART (IMPORTANT)
        console.log("🔄 Restarting bot...")

        setTimeout(() => {
            start()   // 👈 your startBot function
        }, 2000)
    }
})

    // ================= MESSAGES =================
    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0]
        if (!msg.message) return
console.log("------------------------------")
        console.log(msg,{depth:null})
        console.log("------------------------------")
    const pushName = msg.pushName || "Unknown"

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ""

        if (!text) return

        const userJid =
            msg.key.participant || msg.key.remoteJid

        console.log("MSG:", userJid, text)

        // 🔥 NUMBER EXTRACTION
        // NEW ✅
let number = extractPhone(msg)

console.log("📞 Number:", number)
        if (number) {
            number = number.replace(/\D/g, "")

            if (number.startsWith("91") && number.length > 10) {
                number = number.slice(2)
            }
        }

        console.log("📞 Number:", number)

        // 🔥 AUTO LINK
        if (number) {
            const existing = await Birthday.findOne({ number })

            if (existing) {
                await Birthday.updateOne(
                    { _id: existing._id },
                    { jid: userJid }
                )
            } else {
                await Birthday.create({
                    number,
                    jid: userJid,
                    source: "auto"
                })
            }
        }

        // 🎂 AUTO LEARN
        if (msg.key.fromMe && isBirthdayWish(text)) {

            const targetJid =
                msg.message?.extendedTextMessage?.contextInfo?.participant ||
                msg.key.participant ||
                msg.key.remoteJid

            const today = todayDate()

            await Birthday.updateOne(
                { jid: targetJid },
                {
                    jid: targetJid,
                    date: today,
                    greeting: text,
                    number,
                    source: "auto",
                },
                { upsert: true }
            )

            console.log("🎂 Learned")
        }

        // ✍️ MANUAL
        if (text.toLowerCase().startsWith("savebday")) {
            await sock.sendMessage(userJid, {
                text: "✅ Saved"
            })
        }
    })

    // ================= CRON =================
    cron.schedule("15 23 * * *", async () => {

        const today = todayDate()
        const currentYear = new Date().getFullYear()

        const list = await Birthday.find({ date: today })

        for (const user of list) {

            if (user.lastWishedYear === currentYear) continue
            if (!user.jid) continue

            const msgText = await generateBirthdayWish(
                user.name,
                user.greeting,
                user.relation
            )

            await sock.sendMessage(user.jid, {
                text: `🎉 ${msgText}`
            })

            await Birthday.updateOne(
                { _id: user._id },
                { lastWishedYear: currentYear }
            )
        }
    })
}

module.exports = start