const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

let esp32Socket = null;

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams((req.url || '').split('?')[1]);
    const deviceType = urlParams.get('device');

    if (deviceType === 'esp32') {
        esp32Socket = ws;
        console.log('[SİSTEM] ESP32 bağlandı.');

        // Railway bağlantıyı uyutmasın diye ping
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) ws.ping();
        }, 20000);

        esp32Socket.on('close', () => {
            console.log('[SİSTEM] ESP32 bağlantısı koptu.');
            esp32Socket = null;
            clearInterval(pingInterval);
        });
    }

    ws.on('message', (message) => {
        console.log(`[VERİ] ${message}`);
    });

    ws.on('error', (err) => {
        console.error('[HATA] WebSocket hatası:', err.message);
    });
});

app.get('/api/control', (req, res) => {
    const { target, state } = req.query;

    if (!esp32Socket || esp32Socket.readyState !== esp32Socket.OPEN) {
        return res.status(503).json({ status: "error", message: "ESP32 şu an bağlı değil!" });
    }

    const command = JSON.stringify({ target, state: parseInt(state) });
    esp32Socket.send(command);
    console.log(`[KOMUT] -> ESP32: ${command}`);
    return res.json({ status: "success", message: "Komut iletildi" });
});

app.get('/api/status', (req, res) => {
    res.json({ esp32Connected: esp32Socket !== null && esp32Socket.readyState === esp32Socket.OPEN });
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
            background: #0f0f0f;
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .panel {
            width: 100%;
            max-width: 420px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 16px;
            padding: 32px;
        }
        .header { margin-bottom: 28px; }
        .header h1 { font-size: 18px; font-weight: 600; color: #fff; }
        .header p { font-size: 12px; color: #555; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }

        .status-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 24px;
            font-size: 13px;
        }
        .dot {
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #444;
            transition: background 0.3s;
        }
        .dot.online { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
        .dot.offline { background: #ef4444; }

        .control-list { display: flex; flex-direction: column; gap: 12px; }
        .control-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #111;
            border: 1px solid #222;
            border-radius: 10px;
            padding: 16px 18px;
        }
        .control-info { display: flex; flex-direction: column; gap: 3px; }
        .control-name { font-size: 14px; font-weight: 500; color: #ddd; }
        .control-tag { font-size: 11px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; }

        .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #2a2a2a;
            border-radius: 26px;
            transition: .2s;
        }
        .slider:before {
            position: absolute; content: "";
            height: 20px; width: 20px;
            left: 3px; bottom: 3px;
            background: #555;
            border-radius: 50%;
            transition: .2s;
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
        <div class="header">
            <h1>Mermer Makinesi</h1>
            <p>Uzaktan Kontrol Paneli</p>
        </div>

        <div class="status-bar">
            <div class="dot" id="dot"></div>
            <span id="statusText">Kontrol ediliyor...</span>
        </div>

        <div class="control-list">
            <div class="control-row">
                <div class="control-info">
                    <span class="control-name">Su Valfi</span>
                    <span class="control-tag">Digital OUT</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="valveToggle" onchange="sendCommand('valve', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>

            <div class="control-row">
                <div class="control-info">
                    <span class="control-name">Ana Motor</span>
                    <span class="control-tag">Digital OUT</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="motorToggle" onchange="sendCommand('motor', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        function showToast(msg, isError = false) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = 'toast show' + (isError ? ' error' : '');
            setTimeout(() => t.className = 'toast', 2500);
        }

        async function checkStatus() {
            try {
                const r = await fetch('/api/status');
                const d = await r.json();
                const dot = document.getElementById('dot');
                const txt = document.getElementById('statusText');
                dot.className = 'dot ' + (d.esp32Connected ? 'online' : 'offline');
                txt.textContent = d.esp32Connected ? 'ESP32 Bağlı — Hazır' : 'ESP32 Bağlı Değil';
            } catch(e) {}
        }

        async function sendCommand(target, state) {
            try {
                const r = await fetch('/api/control?target=' + target + '&state=' + (state ? 1 : 0));
                const d = await r.json();
                if (d.status !== 'success') {
                    showToast('Hata: ' + d.message, true);
                    // Toggle'ı geri al
                    document.getElementById(target === 'valve' ? 'valveToggle' : 'motorToggle').checked = !state;
                } else {
                    showToast((target === 'valve' ? 'Su Valfi' : 'Motor') + ': ' + (state ? 'Açıldı' : 'Kapatıldı'));
                }
            } catch(err) {
                showToast('Sunucu bağlantı hatası', true);
            }
        }

        checkStatus();
        setInterval(checkStatus, 5000);
    </script>
</body>
</html>`);
});

server.listen(PORT, () => console.log(`[SİSTEM] Sunucu ${PORT} portunda çalışıyor.`));
