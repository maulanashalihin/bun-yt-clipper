# YouTube Clipper - Bun Edition

Versi rewrite dari YouTube Clipper menggunakan [Bun](https://bun.sh/) - JavaScript runtime super cepat.

## 🚀 Keunggulan Bun vs FastAPI

| Aspek | Bun (TypeScript) | FastAPI (Python) |
|-------|------------------|------------------|
| **Startup Time** | ~10ms | ~1-2s |
| **Throughput** | 100k+ req/s | 10-20k req/s |
| **Memory Usage** | ~20MB | ~100MB+ |
| **Type Safety** | Native TypeScript | Pydantic |
| **Single Binary** | ✅ `bun build --compile` | ❌ Perlu Python env |
| **Package Manager** | Built-in (bun install) | pip |
| **Test Runner** | Built-in | pytest (external) |

## 📋 Prerequisites

- [Bun](https://bun.sh/) 1.0+
- FFmpeg
- yt-dlp

## 🛠️ Installation

### Ubuntu 24.04 LTS

```bash
# 1. Install system dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ffmpeg python3 python3-pip

# 2. Install Bun runtime
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # or restart terminal

# 3. Install yt-dlp
pip3 install -U yt-dlp

# 4. Clone repository
git clone https://github.com/maulanashalihin/bun-yt-clipper.git
cd bun-yt-clipper

# 5. Install project dependencies
bun install

# 6. Create downloads directory
mkdir -p downloads

# 7. Setup environment
cp .env.example .env
# Edit .env and configure COOKIES_PATH if needed
nano .env

# 8. Run the server
bun run start
```

### Quick Setup (Local Development)

```bash
# Install dependencies
bun install

# Copy static files from original project
cp -r ../static ./static

# Create downloads directory
mkdir -p downloads

# Setup environment (optional)
cp .env.example .env
# Edit .env file to configure cookies path, port, etc.
```

## 🚀 Running

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start

# Build executable
bun run compile
```

## 📦 Building Single Binary

```bash
# Compile to standalone executable
bun build server.ts --compile --outfile youtube-clipper

# Run the executable
./youtube-clipper
```

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Frontend UI |
| `/api/video-info` | GET | Get video info |
| `/api/download` | POST | Download & clip video |
| `/api/progress/:id` | GET | Get download progress |
| `/api/download-file/:name` | GET | Download processed file |
| `/api/subtitles` | GET | List available subtitles |
| `/api/download-subtitle` | POST | Download subtitle |
| `/ws/progress?id=:id` | WS | Real-time progress (WebSocket) |

## 🌐 WebSocket (Real-time Progress)

Bun mendukung WebSocket native. Frontend bisa connect ke:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/progress?id=clip_xxx');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.progress); // { status, progress, message }
};
```

## 🔄 Migration dari Python

### Perubahan Utama:

| Python | Bun/TypeScript |
|--------|----------------|
| `FastAPI()` | `Bun.serve()` |
| `@app.get()` | Route dalam `fetch` handler |
| `Pydantic BaseModel` | `zod` schema |
| `asyncio.subprocess` | `Bun.spawn()` atau `child_process` |
| `BackgroundTasks` | `setImmediate` / WebSocket |
| `FileResponse` | `Bun.file()` |

### Performa

Benchmark sederhana (lokal, MacBook M1):

```bash
# FastAPI (Uvicorn)
$ wrk -t12 -c400 -d30s http://localhost:8000/
Requests/sec:   8,245

# Bun
$ wrk -t12 -c400 -d30s http://localhost:8000/
Requests/sec:  45,312
```

## ⚙️ Environment Variables

Create `.env` file or copy from `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `COOKIES_PATH` | `cookies.txt` | Path to cookies.txt file |
| `DOWNLOAD_DIR` | `downloads` | Download directory |
| `YT_DLP_EXTRA_ARGS` | - | Extra arguments for yt-dlp |

## 🍪 Setting Up Cookies (Recommended for VPS)

YouTube may block requests from VPS/datacenter IPs. Using cookies from a logged-in account helps bypass this.

### 1. Export Cookies from Browser
- Install extension **"Get cookies.txt LOCALLY"** (Chrome/Firefox)
- Login to YouTube in your browser
- Open the extension and click **"Export"**
- Save as `cookies.txt` in the project root

### 2. Upload to VPS
```bash
scp cookies.txt user@your-vps-ip:~/bun-yt-clipper/
```

### 3. Verify in .env
```bash
cat .env | grep COOKIES_PATH
# Should show: COOKIES_PATH=cookies.txt
```

## 🚀 Running as System Service (Ubuntu)

Create systemd service for auto-start on boot:

```bash
# Create service file
sudo nano /etc/systemd/system/youtube-clipper.service
```

Add this content:
```ini
[Unit]
Description=YouTube Clipper Bun Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/bun-yt-clipper
ExecStart=/home/your-username/.bun/bin/bun run start
Restart=on-failure
RestartSec=5
Environment="PATH=/home/your-username/.bun/bin:/usr/local/bin:/usr/bin"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable youtube-clipper
sudo systemctl start youtube-clipper

# Check status
sudo systemctl status youtube-clipper

# View logs
sudo journalctl -u youtube-clipper -f
```

## 🐛 Troubleshooting

### "yt-dlp not found"
```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt install yt-dlp
# or use pip: pip3 install -U yt-dlp
```

### "FFmpeg not found"
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian  
sudo apt install ffmpeg
```

### "bun: command not found"
```bash
# Reinstall or reload shell
source ~/.bashrc
# or
source ~/.zshrc
```

### YouTube blocks VPS IP (403/429 errors)
This is common on VPS. Solutions:

1. **Use cookies** (see 🍪 Setting Up Cookies section)

2. **Force IPv4** - Most VPS have both IPv4 and IPv6, but IPv6 is often blocked:
   ```env
   FORCE_IPV4=true
   ```

3. **Use proxy** - Add to `.env`:
   ```env
   YT_DLP_EXTRA_ARGS=--proxy http://user:pass@proxy:port
   ```

4. **PO Token** (yt-dlp 2024.12+) - Add to `.env`:
   ```env
   YT_DLP_EXTRA_ARGS=--extractor-args "youtube:po_token=YOUR_TOKEN"
   ```

5. **Custom User-Agent** - If default doesn't work:
   ```env
   YT_DLP_USER_AGENT=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36...
   ```

6. **Combine multiple options** for best results:
   ```env
   FORCE_IPV4=true
   COOKIES_PATH=cookies.txt
   YT_DLP_EXTRA_ARGS=--extractor-args "youtube:player_client=web"
   ```

### "unable to extract initial player response" or "Sign in to confirm you're not a bot"
This is YouTube's anti-bot protection. Try:
1. Export fresh cookies from browser (must be logged in to YouTube)
2. Update yt-dlp: `pip3 install -U yt-dlp`
3. Use PO Token (see above)
4. Add retry configuration:
   ```env
   MAX_RETRIES=5
   RETRY_DELAY_MS=3000
   ```

### Port already in use
```bash
PORT=8001 bun run start
```

## 📄 License

MIT
