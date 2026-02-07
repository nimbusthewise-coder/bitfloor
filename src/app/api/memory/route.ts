import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const WORKSPACE = process.env.WORKSPACE_PATH || "/Users/nimbus/.openclaw/workspace";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  try {
    if (file === "_list") {
      // List available memory files
      const memoryDir = join(WORKSPACE, "memory");
      const files = await readdir(memoryDir).catch(() => []);
      
      // Get daily files (YYYY-MM-DD.md format)
      const dailyFiles = files
        .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()
        .reverse()
        .slice(0, 7); // Last 7 days

      // Build file list
      const fileList = [
        { name: "MEMORY.md", label: "Long-term", path: join(WORKSPACE, "MEMORY.md") },
        ...dailyFiles.map(f => ({
          name: f,
          label: f.replace(".md", ""),
          path: join(memoryDir, f),
        })),
        { name: "patterns.md", label: "Patterns", path: join(memoryDir, "patterns.md") },
      ];

      return NextResponse.json({ files: fileList });
    }

    // Read specific file
    let filePath: string;
    if (file === "MEMORY.md") {
      filePath = join(WORKSPACE, "MEMORY.md");
    } else if (file) {
      filePath = join(WORKSPACE, "memory", file);
    } else {
      return NextResponse.json({ error: "No file specified" }, { status: 400 });
    }

    const content = await readFile(filePath, "utf-8");
    
    // Get file stats
    const stats = await import("fs/promises").then(fs => fs.stat(filePath));
    
    return NextResponse.json({
      file,
      content,
      modified: stats.mtime.toISOString(),
      size: stats.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
