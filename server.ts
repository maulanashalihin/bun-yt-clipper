#!/usr/bin/env bun
import { serve, type ServerWebSocket } from "bun";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { randomBytes } from "crypto";
import { z } from "zod";

// ============ CONFIGURATION ============
// Load .env file (Bun automatically loads .env)
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;
const HOST = process.env.HOST || "0.0.0.0";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR 
  ? resolve(process.cwd(), process.env.DOWNLOAD_DIR)
  : resolve(process.cwd(), "downloads");
const STATIC_DIR = resolve(process.cwd(), "static");
const COOKIES_PATH = process.env.COOKIES_PATH 
  ? (process.env.COOKIES_PATH.startsWith("/") 
      ? process.env.COOKIES_PATH 
      : resolve(process.cwd(), process.env.COOKIES_PATH))
  : resolve(process.cwd(), "cookies.txt");
const YT_DLP_EXTRA_ARGS = process.env.YT_DLP_EXTRA_ARGS?.split(" ").filter(Boolean) || [];

// Create downloads directory
if (!existsSync(DOWNLOAD_DIR)) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ============ TYPES ============
interface DownloadProgress {
  status: "downloading" | "processing" | "completed" | "error";
  progress: number;
  message: string;
  filename?: string;
  download_url?: string;
}

interface VideoFormat {
  format_id: string;
  quality: string;
  resolution: string;
  ext: string;
}

interface VideoInfo {
  title: string;
  duration: number;
  duration_string: string;
  thumbnail: string;
  uploader: string;
  formats: VideoFormat[];
}

interface SubtitleInfo {
  type: "manual" | "auto";
  name: string;
  url: string;
}

// ============ IN-MEMORY STORE ============
const downloadProgress = new Map<string, DownloadProgress>();
const clients = new Map<string, Set<ServerWebSocket<unknown>>>();

// ============ VALIDATION SCHEMAS ============
const ClipRequestSchema = z.object({
  url: z.string().url(),
  start_time: z.string().regex(/^\d+:[0-5]\d(:[0-5]\d)?$/),
  end_time: z.string().regex(/^\d+:[0-5]\d(:[0-5]\d)?$/),
});

const SubtitleDownloadSchema = z.object({
  url: z.string().url(),
  lang: z.string().default("en"),
  format: z.enum(["srt", "vtt", "txt"]).default("srt"),
});

// ============ UTILITIES ============
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  throw new Error("Invalid time format");
}

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function generateId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const random = randomBytes(4).toString("hex");
  return `clip_${timestamp}_${random}`;
}

async function cleanupOldFiles(): Promise<void> {
  const now = Date.now();
  const oneHour = 3600 * 1000;

  try {
    const files = readdirSync(DOWNLOAD_DIR);
    for (const file of files) {
      const filePath = join(DOWNLOAD_DIR, file);
      try {
        const stats = statSync(filePath);
        if (now - stats.mtimeMs > oneHour) {
          unlinkSync(filePath);
          console.log(`Cleaned up: ${file}`);
        }
      } catch {
        // Ignore errors
      }
    }
  } catch {
    // Ignore errors
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// ============ YT-DLP HELPERS ============
async function runYTDL(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Add cookies if available
    const finalArgs = [
      ...(existsSync(COOKIES_PATH) ? ["--cookies", COOKIES_PATH] : []),
      ...YT_DLP_EXTRA_ARGS,
      ...args
    ];
    
    const proc = spawn("yt-dlp", finalArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function runYTDLPWithProgress(
  url: string,
  outputPath: string,
  downloadId: string,
  quality: string = "best"
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      ...(existsSync(COOKIES_PATH) ? ["--cookies", COOKIES_PATH] : []),
      ...YT_DLP_EXTRA_ARGS,
      "-f", quality,
      "--merge-output-format", "mkv",
      "-o", outputPath,
      "--newline",
      url,
    ];

    const proc = spawn("yt-dlp", args);

    proc.stderr.on("data", (data) => {
      const line = data.toString();
      // Parse progress from yt-dlp output
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        const progress = Math.min(Math.floor(percent * 0.5), 50); // First 50% for download
        downloadProgress.set(downloadId, {
          status: "downloading",
          progress,
          message: `Downloading... ${percent.toFixed(1)}%`,
        });
        broadcastProgress(downloadId);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        downloadProgress.set(downloadId, {
          status: "processing",
          progress: 50,
          message: "Processing video...",
        });
        broadcastProgress(downloadId);
        resolve();
      } else {
        reject(new Error(`Download failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function runFFmpeg(
  input: string,
  output: string,
  startTime: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss", startTime,
      "-i", input,
      "-t", duration.toString(),
      "-c", "copy",
      output,
    ];

    const proc = spawn("ffmpeg", args);

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Try with re-encoding
        const reencodeArgs = [
          "-y",
          "-ss", startTime,
          "-i", input,
          "-t", duration.toString(),
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "18",
          "-c:a", "aac",
          "-b:a", "192k",
          output,
        ];

        const reencodeProc = spawn("ffmpeg", reencodeArgs);
        reencodeProc.on("close", (code2) => {
          if (code2 === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg failed with code ${code2}`));
          }
        });
      }
    });

    proc.on("error", reject);
  });
}

// ============ WEBSOCKET HELPERS ============
function broadcastProgress(downloadId: string): void {
  const progress = downloadProgress.get(downloadId);
  if (!progress) return;

  const clientSet = clients.get(downloadId);
  if (!clientSet) return;

  const message = JSON.stringify({
    type: "progress",
    download_id: downloadId,
    data: progress,
  });

  for (const ws of clientSet) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// ============ ROUTE HANDLERS ============
async function handleGetVideoInfo(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const output = await runYTDL(["--dump-json", "-q", "--no-warnings", url]);
    const info = JSON.parse(output);

    // Get available formats with video and audio
    const formats: VideoFormat[] = [];
    for (const f of info.formats || []) {
      if (f.vcodec !== "none" && f.acodec !== "none") {
        formats.push({
          format_id: f.format_id,
          quality: f.quality_label || "unknown",
          resolution: f.resolution || "unknown",
          ext: f.ext,
        });
      }
    }

    // Sort by quality (highest first)
    const qualityOrder: Record<string, number> = {
      "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0,
    };
    formats.sort((a, b) => (qualityOrder[b.quality] || -1) - (qualityOrder[a.quality] || -1));

    const videoInfo: VideoInfo = {
      title: info.title,
      duration: info.duration,
      duration_string: formatSeconds(info.duration || 0),
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      formats: formats.slice(0, 10),
    };

    return Response.json(videoInfo);
  } catch (error) {
    return Response.json(
      { error: `Error fetching video info: ${(error as Error).message}` },
      { status: 400 }
    );
  }
}

async function handleDownloadClip(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = ClipRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        { error: "Invalid request", details: result.error.format() },
        { status: 400 }
      );
    }

    const { url, start_time, end_time } = result.data;

    // Validate times
    const startSeconds = timeToSeconds(start_time);
    const endSeconds = timeToSeconds(end_time);

    if (startSeconds >= endSeconds) {
      return Response.json(
        { error: "Start time must be before end time" },
        { status: 400 }
      );
    }

    if (endSeconds - startSeconds > 600) {
      return Response.json(
        { error: "Clip duration cannot exceed 10 minutes" },
        { status: 400 }
      );
    }

    // Create unique filename
    const downloadId = generateId();
    const outputFile = join(DOWNLOAD_DIR, `${downloadId}.mp4`);
    const tempFile = join(DOWNLOAD_DIR, `${downloadId}_temp.mkv`);

    downloadProgress.set(downloadId, {
      status: "downloading",
      progress: 0,
      message: "Starting download...",
    });

    // Start download in background
    (async () => {
      try {
        // Download video
        await runYTDLPWithProgress(
          url,
          tempFile,
          downloadId,
          "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best"
        );

        // Update progress
        downloadProgress.set(downloadId, {
          status: "processing",
          progress: 60,
          message: "Cutting video...",
        });
        broadcastProgress(downloadId);

        // Cut video
        const duration = endSeconds - startSeconds;
        const startTimeStr = formatSeconds(startSeconds);

        await runFFmpeg(tempFile, outputFile, startTimeStr, duration);

        // Cleanup temp file
        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore
        }

        // Update progress
        downloadProgress.set(downloadId, {
          status: "completed",
          progress: 100,
          message: "Done!",
          filename: `${downloadId}.mp4`,
          download_url: `/api/download-file/${downloadId}.mp4`,
        });
        broadcastProgress(downloadId);

        // Cleanup old files
        await cleanupOldFiles();
      } catch (error) {
        downloadProgress.set(downloadId, {
          status: "error",
          progress: 0,
          message: (error as Error).message,
        });
        broadcastProgress(downloadId);
      }
    })();

    return Response.json({
      success: true,
      download_id: downloadId,
      filename: `${downloadId}.mp4`,
      download_url: `/api/download-file/${downloadId}.mp4`,
    });
  } catch (error) {
    return Response.json(
      { error: `Error processing video: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

async function handleGetProgress(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const downloadId = parts[parts.length - 1];

  const progress = downloadProgress.get(downloadId);
  if (!progress) {
    return Response.json({ error: "Download not found" }, { status: 404 });
  }

  return Response.json(progress);
}

async function handleDownloadFile(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const filename = parts[parts.length - 1];

  const filePath = join(DOWNLOAD_DIR, filename);

  if (!existsSync(filePath)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const file = Bun.file(filePath);
  return new Response(file, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function handleGetSubtitles(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const output = await runYTDL([
      "--dump-json",
      "-q",
      "--no-warnings",
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      url,
    ]);

    const info = JSON.parse(output);
    const subtitles: Record<string, SubtitleInfo> = {};

    // Process manual subtitles
    for (const [langCode, subs] of Object.entries(info.subtitles || {})) {
      const subArray = subs as Array<{ name: string; url: string }>;
      subtitles[langCode] = {
        type: "manual",
        name: subArray[0]?.name || langCode,
        url: subArray[0]?.url || "",
      };
    }

    // Process automatic captions
    for (const [langCode, subs] of Object.entries(info.automatic_captions || {})) {
      if (!subtitles[langCode]) {
        const subArray = subs as Array<{ name: string; url: string }>;
        subtitles[langCode] = {
          type: "auto",
          name: subArray[0]?.name || langCode,
          url: subArray[0]?.url || "",
        };
      }
    }

    return Response.json({
      video_id: info.id,
      title: info.title,
      available_subtitles: subtitles,
    });
  } catch (error) {
    return Response.json(
      { error: `Error fetching subtitles: ${(error as Error).message}` },
      { status: 400 }
    );
  }
}

async function handleDownloadSubtitle(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = SubtitleDownloadSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        { error: "Invalid request", details: result.error.format() },
        { status: 400 }
      );
    }

    const { url, lang, format } = result.data;

    const downloadId = `subtitle_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const outputFile = join(DOWNLOAD_DIR, `${downloadId}.${format}`);

    // Get video info first for filename
    const infoOutput = await runYTDL(["--dump-json", "-q", "--no-warnings", url]);
    const info = JSON.parse(infoOutput);
    const videoTitle = info.title || "video";

    // Download subtitle
    await runYTDL([
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", lang,
      "--sub-format", format === "txt" ? "srt" : format,
      "-o", join(DOWNLOAD_DIR, downloadId),
      url,
    ]);

    // Find the downloaded file
    const possibleNames = [
      `${downloadId}.${lang}.${format}`,
      `${downloadId}.${lang}.srt`,
      `${downloadId}.${lang}.vtt`,
      `${downloadId}.${format}`,
      `${downloadId}.srt`,
      `${downloadId}.vtt`,
    ];

    let foundFile: string | null = null;
    for (const name of possibleNames) {
      const testPath = join(DOWNLOAD_DIR, name);
      if (existsSync(testPath)) {
        foundFile = testPath;
        break;
      }
    }

    if (!foundFile) {
      return Response.json(
        { error: `Subtitle not available for language: ${lang}` },
        { status: 404 }
      );
    }

    // Convert to txt if needed
    let finalFile = foundFile;
    if (format === "txt") {
      const content = await Bun.file(foundFile).text();
      const plainText = convertSubtitleToText(content);
      finalFile = join(DOWNLOAD_DIR, `${downloadId}.txt`);
      await Bun.write(finalFile, plainText);
      try {
        unlinkSync(foundFile);
      } catch {
        // Ignore
      }
    }

    // Create safe filename for download
    const safeTitle = videoTitle.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    const downloadName = `${safeTitle}_${lang}.${format}`;

    const file = Bun.file(finalFile);
    return new Response(file, {
      headers: {
        "Content-Type": format === "txt" ? "text/plain" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: `Error downloading subtitle: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

function convertSubtitleToText(content: string): string {
  const lines = content.split("\n");
  const textLines: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed.match(/^\d+$/)) {
      skipNext = true;
      continue;
    }
    if (trimmed.includes("-->") || skipNext) {
      skipNext = false;
      continue;
    }
    if (trimmed.startsWith("WEBVTT") || trimmed.startsWith("NOTE") || trimmed.startsWith("STYLE")) {
      continue;
    }

    // Remove HTML tags
    const cleanLine = trimmed.replace(/<[^>]+>/g, "");
    if (cleanLine && !textLines.includes(cleanLine)) {
      textLines.push(cleanLine);
    }
  }

  return textLines.join("\n");
}

async function serveStaticFile(path: string): Promise<Response> {
  const filePath = join(STATIC_DIR, path);
  const resolvedPath = resolve(filePath);

  // Security: ensure file is within static directory
  if (!resolvedPath.startsWith(resolve(STATIC_DIR))) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(resolvedPath)) {
    return new Response("Not found", { status: 404 });
  }

  const file = Bun.file(resolvedPath);
  return new Response(file);
}

// ============ SERVER SETUP ============
const server = serve({
  hostname: HOST,
  port: PORT,
  fetch(req: Request, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Routes
    if (pathname === "/" && req.method === "GET") {
      return serveStaticFile("index.html");
    }

    if (pathname === "/api/video-info" && req.method === "GET") {
      return handleGetVideoInfo(req);
    }

    if (pathname === "/api/download" && req.method === "POST") {
      return handleDownloadClip(req);
    }

    if (pathname.startsWith("/api/progress/") && req.method === "GET") {
      return handleGetProgress(req);
    }

    if (pathname.startsWith("/api/download-file/") && req.method === "GET") {
      return handleDownloadFile(req);
    }

    if (pathname === "/api/subtitles" && req.method === "GET") {
      return handleGetSubtitles(req);
    }

    if (pathname === "/api/download-subtitle" && req.method === "POST") {
      return handleDownloadSubtitle(req);
    }

    // WebSocket upgrade for real-time progress
    if (pathname === "/ws/progress") {
      const success = server.upgrade(req, {
        data: { url: req.url },
      });
      return success
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Static files
    if (pathname.startsWith("/static/")) {
      return serveStaticFile(pathname.slice(8));
    }

    // 404
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws: ServerWebSocket<{ url: string }>) {
      const url = new URL(ws.data.url);
      const downloadId = url.searchParams.get("id");
      if (downloadId) {
        if (!clients.has(downloadId)) {
          clients.set(downloadId, new Set());
        }
        clients.get(downloadId)!.add(ws);
      }
    },
    close(ws: ServerWebSocket<{ url: string }>) {
      const url = new URL(ws.data.url);
      const downloadId = url.searchParams.get("id");
      if (downloadId && clients.has(downloadId)) {
        clients.get(downloadId)!.delete(ws);
      }
    },
    message(ws: ServerWebSocket<{ url: string }>, message: string) {
      // Handle incoming messages if needed
    },
  },
});

console.log(`🚀 YouTube Clipper (Bun) running at http://${HOST}:${PORT}`);
console.log(`📁 Downloads directory: ${DOWNLOAD_DIR}`);
console.log(`📂 Static directory: ${STATIC_DIR}`);
if (existsSync(COOKIES_PATH)) {
  console.log(`🍪 Cookies enabled: ${COOKIES_PATH}`);
} else {
  console.log(`⚠️  Cookies not found at: ${COOKIES_PATH}`);
}
if (YT_DLP_EXTRA_ARGS.length > 0) {
  console.log(`⚙️  Extra yt-dlp args: ${YT_DLP_EXTRA_ARGS.join(" ")}`);
}
