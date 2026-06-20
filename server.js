const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Komut kuyruğu — ESP32 gelince alır
let commandQueue = [];
let esp32LastSeen = null;

// Mevcut app.listen'ın ALTINA ekle
const http_server = require('http').createServer(app);
http_server.listen(8080, () => console.log('HTTP 8080 açık'));

// ESP32 her 2 saniyede buraya gelir, varsa komutu alır
app.get('/api/poll', (req, res) => {
    esp32LastSeen = Date.now();
    if (commandQueue.length > 0) {
        const cmd = commandQueue.shift(); // Kuyruktaki ilk komutu al ve sil
        return res.json({ hasCommand: true, command: cmd });
    }
    res.json({ hasCommand: false });
});

// Web arayüzünden komut gelir, kuyruğa eklenir
app.get('/api/control', (req, res) => {
    const { target, state } = req.query;
    if (!target || state === undefined) {
        return res.status(400).json({ status: "error", message: "Eksik parametre" });
    }
    commandQueue.push({ target, state: parseInt(state) });
    console.log(`[KOMUT] Kuyruğa eklendi: ${target} -> ${state}`);
    res.json({ status: "success" });
});

// ESP32 bağlı mı kontrolü
app.get('/api/status', (req, res) => {
    const online = esp32LastSeen && (Date.now() - esp32LastSeen < 10000);
    res.json({ esp32Connected: !!online });
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermer Makinesi</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f0f0f; color: #e0e0e0;
            min-height: 100vh; display: flex;
            align-items: center; justify-content: center; padding: 20px;
        }
        .panel {
            width: 100%; max-width: 420px;
            background: #1a1a1a; border: 1px solid #2a2a2a;
            border-radius: 16px; padding: 32px;
        }
        h1 { font-size: 18px; font-weight: 600; color: #fff; }
        .subtitle { font-size: 12px; color: #555; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 24px; }
        .status-bar {
            display: flex; align-items: center; gap: 8px;
            background: #111; border: 1px solid #222;
            border-radius: 8px; padding: 10px 14px;
            margin-bottom: 24px; font-size: 13px;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #444; transition: background 0.3s; }
        .dot.online { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
        .dot.offline { background: #ef4444; }
        .control-list { display: flex; flex-direction: column; gap: 12px; }
        .control-row {
            display: flex; justify-content: space-between; align-items: center;
            background: #111; border: 1px solid #222;
            border-radius: 10px; padding: 16px 18px;
        }
        .control-name { font-size: 14px; font-weight: 500; color: #ddd; }
        .control-tag { font-size: 11px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }
        .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #2a2a2a; border-radius: 26px; transition: .2s;
        }
        .slider:before {
            position: absolute; content: "";
            height: 20px; width: 20px; left: 3px; bottom: 3px;
            background: #555; border-radius: 50%; transition: .2s;
        }
        input:checked + .slider { background: #2563eb; }
        input:checked + .slider:before { background: #fff; transform: translateX(22px); }
        .toast {
            position: fixed; bottom: 24px; right: 24px;
            background: #1e1e1e; border: 1px solid #333;
            border-radius: 8px; padding: 12px 18px;
            font-size: 13px; color: #ccc;
            opacity: 0; transform: translateY(10px);
            transition: all 0.3s; pointer-events: none;
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.error { border-color: #7f1d1d; color: #fca5a5; }
    </style>
</head>
<body>
    <div class="panel">
        <h1>Mermer Makinesi</h1>
        <div class="subtitle">Uzaktan Kontrol Paneli</div>
        <div class="status-bar">
            <div class="dot" id="dot"></div>
            <span id="statusText">Kontrol ediliyor...</span>
        </div>
        <div class="control-list">
            <div class="control-row">
                <div>
                    <div class="control-name">Su Valfi</div>
                    <div class="control-tag">Digital OUT</div>
                </div>
                <label class="switch">
                    <input type="checkbox" onchange="sendCommand('valve', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="control-row">
                <div>
                    <div class="control-name">Ana Motor</div>
                    <div class="control-tag">Digital OUT</div>
                </div>
                <label class="switch">
                    <input type="checkbox" onchange="sendCommand('motor', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    </div>
    <div class="toast" id="toast"></div>
    <script>
        function showToast(msg, err) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = 'toast show' + (err ? ' error' : '');
            setTimeout(() => t.className = 'toast', 2500);
        }
        async function sendCommand(target, state) {
            try {
                const r = await fetch('/api/control?target=' + target + '&state=' + (state?1:0));
                const d = await r.json();
                if (d.status !== 'success') showToast('Hata!', true);
                else showToast((target==='valve'?'Su Valfi':'Motor') + ': ' + (state?'Açıldı':'Kapatıldı'));
            } catch(e) { showToast('Bağlantı hatası', true); }
        }
        async function checkStatus() {
            try {
                const r = await fetch('/api/status');
                const d = await r.json();
                document.getElementById('dot').className = 'dot ' + (d.esp32Connected ? 'online' : 'offline');
                document.getElementById('statusText').textContent = d.esp32Connected ? 'ESP32 Bağlı — Hazır' : 'ESP32 Bağlı Değil';
            } catch(e) {}
        }
        checkStatus();
        setInterval(checkStatus, 3000);
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`[SİSTEM] Sunucu ${PORT} portunda çalışıyor.`));
