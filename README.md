# YouTube Clipper - Bun Edition

YouTube video clipper & subtitle downloader. Download video clips dan subtitle dengan mudah melalui web UI.

![Demo](https://i.imgur.com/placeholder.gif)

## ✨ Fitur

- 🎬 Download video YouTube (clip/custom duration)
- 📝 Download subtitle (SRT, VTT, TXT)
- 🎨 Web UI yang clean & responsive
- ⚡ Cepat & lightweight (Bun runtime)
- 🔄 Real-time progress via WebSocket

## 🚀 Quick Start

### Prerequisites

Pastikan sudah terinstall:
- [Bun](https://bun.sh/) 1.0+
- FFmpeg
- yt-dlp

### Install Dependencies (Pilih OS)

#### 🪟 Windows

**1. Install Bun:**
```powershell
# PowerShell (Admin)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**2. Install FFmpeg:**
```powershell
# Via winget
winget install Gyan.FFmpeg

# Atau via chocolatey
choco install ffmpeg

# Atau download manual dari https://ffmpeg.org/download.html
# Extract dan tambahkan ke PATH
```

**3. Install yt-dlp:**
```powershell
# Via pip
pip install -U yt-dlp

# Atau download binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o yt-dlp.exe
# Pindahkan ke folder yang ada di PATH
```

#### 🍎 macOS

**1. Install Bun:**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc  # atau ~/.bashrc
```

**2. Install FFmpeg & yt-dlp:**
```bash
# Via Homebrew
brew install ffmpeg yt-dlp

# Atau pip untuk yt-dlp
pip3 install -U yt-dlp
```

#### 🐧 Linux (Ubuntu/Debian)

```bash
# 1. Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 2. Install FFmpeg & Python
sudo apt update
sudo apt install -y ffmpeg python3 python3-pip

# 3. Install yt-dlp
pip3 install -U yt-dlp

# Atau via apt (versi mungkin lebih lama)
# sudo apt install yt-dlp
```

#### 🐧 Linux (Fedora/RHEL)

```bash
# 1. Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 2. Install FFmpeg
sudo dnf install ffmpeg

# 3. Install yt-dlp
pip3 install -U yt-dlp

# Atau
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod +x ~/.local/bin/yt-dlp
```

#### 🐧 Linux (Arch)

```bash
# 1. Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 2. Install FFmpeg & yt-dlp
sudo pacman -S ffmpeg yt-dlp
```

### Clone & Run

```bash
# Clone repository
git clone https://github.com/maulanashalihin/bun-yt-clipper.git
cd bun-yt-clipper

# Install dependencies
bun install

# Run development mode (hot reload)
bun run dev

# Atau run production mode
bun run start
```

Buka browser: http://localhost:8000

## 📦 Installation via bunx (Alternative)

Jika tidak ingin clone repo, bisa langsung jalankan via bunx:

```bash
# Install & run langsung (tanpa clone)
bunx youtube-clipper-bun

# Dengan custom port
PORT=3000 bunx youtube-clipper-bun
```

## ⚙️ Configuration

Buat file `.env` di root folder (opsional):

```env
# Server
PORT=8000
HOST=localhost

# Download
DOWNLOAD_DIR=downloads

# Network
FORCE_IPV4=true

# Retry
MAX_RETRIES=3
RETRY_DELAY_MS=2000

# Optional: Extra args untuk yt-dlp
# YT_DLP_EXTRA_ARGS=--extractor-args "youtube:player_client=web"
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
| `/ws/progress?id=:id` | WS | Real-time progress |

## 🐛 Troubleshooting

### Windows

**"bun is not recognized"**
- Restart terminal setelah install Bun
- Atau jalankan: `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User')`

**"ffmpeg not found"**
```powershell
# Cek FFmpeg terinstall
ffmpeg -version

# Jika tidak, install via winget
winget install Gyan.FFmpeg
# Restart terminal setelah install
```

**"yt-dlp not found"**
```powershell
# Install via pip
pip install -U yt-dlp

# Atau download binary ke folder di PATH
# Cek PATH: $env:PATH -split ';'
```

### macOS

**"bun: command not found"**
```bash
# Reload shell config
source ~/.zshrc  # atau ~/.bashrc

# Atau install ulang
curl -fsSL https://bun.sh/install | bash
```

**"ffmpeg not found"**
```bash
# Install via Homebrew
brew install ffmpeg

# Jika sudah install tapi tidak terdeteksi:
brew link ffmpeg --force
```

### Linux

**"Permission denied" saat install Bun**
```bash
# Tambahkan ke PATH manual
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
```

**"yt-dlp: command not found" (setelah pip install)**
```bash
# Tambahkan local bin ke PATH
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

**"error while loading shared libraries" (FFmpeg)**
```bash
# Ubuntu/Debian
sudo apt install ffmpeg libavcodec-extra

# Fedora
sudo dnf install ffmpeg-devel
```

### YouTube Blocks (403/429 Errors)

Ini umum terjadi di VPS atau network tertentu. Solusi:

**1. Force IPv4** (paling umum di VPS):
```env
FORCE_IPV4=true
```

**2. Use Proxy**:
```env
YT_DLP_EXTRA_ARGS=--proxy http://user:pass@proxy:port
```

**3. PO Token** (yt-dlp 2024.12+):
```env
YT_DLP_EXTRA_ARGS=--extractor-args "youtube:po_token=YOUR_TOKEN"
```

**4. Update yt-dlp**:
```bash
# Windows
pip install -U yt-dlp

# macOS/Linux
pip3 install -U yt-dlp
# atau
yt-dlp -U
```

**5. Retry Configuration**:
```env
MAX_RETRIES=5
RETRY_DELAY_MS=3000
```

### Port Already in Use

```bash
# Ganti port
PORT=3000 bun run start

# Atau kill process di port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill -9
```

## 📦 Build Executable

```bash
# Compile ke standalone executable
bun run compile

# Run executable
./youtube-clipper  # macOS/Linux
youtube-clipper.exe  # Windows
```

## 📝 License

MIT
