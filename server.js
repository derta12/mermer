const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

let esp32Socket = null; // ESP32 bağlantısını hafızada tutacağız

// Web Sockets Bağlantı Yönetimi
wss.on('connection', (ws, req) => {
    console.log('[Canlı Bağlantı] Yeni bir cihaz/arayüz bağlandı.');

    // Bağlanan cihazın ESP32 mi yoksa Web Arayüzü mü olduğunu anlamak için url parametresine bakıyoruz
    // ESP32 bağlanırken ws://sunucu_adresi/?device=esp32 diyecek
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const deviceType = urlParams.get('device');

    if (deviceType === 'esp32') {
        esp32Socket = ws;
        console.log('[Sistem] Mermer Makinesi (ESP32) buluta başarıyla bağlandı!');
        
        esp32Socket.on('close', () => {
            console.log('[Sistem] Mermer Makinesi bağlantısı koptu.');
            esp32Socket = null;
        });
    }

    // Tarayıcıdan veya ESP32'den gelen mesajları dinle
    ws.on('message', (message) => {
        console.log(`[Veri] Gelen Mesaj: ${message}`);
        // İhtiyaç halinde burada ESP32'den gelen sensör verileri işlenip web arayüzüne gönderilebilir
    });
});

// Arayüzden (Butonlardan) gelen HTTP istekleri doğrudan WebSocket üzerinden ESP32'ye aktarılır
app.get('/api/control', (expressReq, expressRes) => {
    const { target, state } = expressReq.query; // Örn: ?target=valve&state=1

    if (!esp32Socket) {
        return expressRes.status(503).json({ status: "error", message: "Mermer makinesi şu anda buluta bağlı değil!" });
    }

    // Komutu JSON formatında ESP32'ye gönderiyoruz
    const command = JSON.stringify({ target: target, state: parseInt(state) });
    esp32Socket.send(command);
    
    console.log(`[Komut Gönderildi] -> ESP32: ${command}`);
    return expressRes.json({ status: "success", message: "Komut cihaza iletildi" });
});

// Web Arayüzü (Temiz, Beyaz Endüstriyel Tema)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mermer Makinesi Uzaktan Kontrol Paneli</title>
        <style>
            :root {
                --bg-color: #fcfcfc;
                --card-bg: #ffffff;
                --text-color: #2b2d42;
                --border-color: #e2e8f0;
                --primary-color: #3182ce;
                --success-color: #38a169;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-color);
                margin: 0;
                padding: 30px;
                display: flex;
                justify-content: center;
            }
            .container {
                width: 100%;
                max-width: 550px;
                background: var(--card-bg);
                padding: 35px;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.03);
                border: 1px solid var(--border-color);
            }
            h1 { font-size: 22px; font-weight: 600; margin: 0 0 5px 0; color: #1a202c; }
            .subtitle { font-size: 13px; color: #718096; margin-bottom: 30px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .control-card {
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 10px 20px;
                margin-top: 20px;
            }
            .io-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 18px 0;
            }
            .io-row:not(:last-child) { border-bottom: 1px solid var(--border-color); }
            .io-label { font-weight: 500; font-size: 15px; }
            
            /* Switch Tasarımı */
            .switch { position: relative; display: inline-block; width: 46px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #cbd5e0; transition: .2s; border-radius: 24px;
            }
            .slider:before {
                position: absolute; content: ""; height: 18px; width: 18px;
                left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%;
            }
            input:checked + .slider { background-color: var(--primary-color); }
            input:checked + .slider:before { transform: translateX(22px); }
            
            .alert-box {
                background-color: #ebf8ff; color: #2b6cb0; padding: 12px; 
                border-radius: 8px; font-size: 13px; border: 1px solid #bee3f8; margin-bottom: 20px;
                text-align: center; font-weight: 500;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Mermer Makinesi Kontrol Paneli</h1>
            <div class="subtitle">Cloud Uzaktan Erişim Ağ Geçidi (Gateway)</div>
            
            <div class="alert-box">
                Sistem Durumu: Dünyanın her yerinden erişime açık (Güvenli Protokol)
            </div>

            <div class="control-card">
                <div class="io-row">
                    <span class="io-label">Su Valfi (Digital OUT)</span>
                    <label class="switch">
                        <input type="checkbox" id="valveToggle" onchange="sendCommand('valve', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="io-row">
                    <span class="io-label">Ana Motor Kesici (Digital OUT)</span>
                    <label class="switch">
                        <input type="checkbox" id="motorToggle" onchange="sendCommand('motor', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <script>
            // Doğrudan Render API'sine komut gönderir. IP adresiyle işimiz kalmadı!
            async function sendCommand(target, state) {
                let numericState = state ? 1 : 0;
                try {
                    let response = await fetch(\`/api/control?target=\${target}&state=\${numericState}\`);
                    let result = await response.json();
                    if(result.status !== "success") {
                        alert("Hata: " + result.message);
                    }
                } catch (err) {
                    console.error("Komut gönderilemedi:", err);
                    alert("Sunucu iletişim hatası.");
                }
            }
        </script>
    </body>
    </html>
    `);
});

server.listen(PORT, () => {
    console.log(`Cloud Server up and running on port ${PORT}`);
});