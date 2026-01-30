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

## 🐛 Troubleshooting

### "yt-dlp not found"
```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt install yt-dlp
```

### "FFmpeg not found"
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian  
sudo apt install ffmpeg
```

### Port already in use
```bash
PORT=8001 bun run start
```

## 📄 License

MIT
