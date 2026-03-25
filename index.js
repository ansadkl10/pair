const express = require('express');
const path = require('path');
const pino = require('pino');
const fs = require('fs');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    Browsers
} = require("@eypzx/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/session', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Phone number is required!" });

    // Temp folder for session
    const sessionPath = `./temp/${num}_${Date.now()}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    try {
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Desktop') // macOS type login
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            num = num.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(5000);
                
                // Hex format session ID (No Base64)
                const sessionStr = JSON.stringify(sock.authState.creds);
                const sessionId = "ZENX~" + Buffer.from(sessionStr).toString('hex');
                
                // WhatsApp-ilekku message ayakkunnu
                await sock.sendMessage(sock.user.id, { 
                    text: `*NEXA-MD SESSION ID*\n\n_Keep this safe!_\n\n\`\`\`${sessionId}\`\`\`` 
                });
                
                // Cleanup
                setTimeout(() => {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }, 10000);
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => console.log(`Nexa-MD Server running on port ${PORT}`));
