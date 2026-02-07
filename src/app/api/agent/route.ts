import { NextResponse } from "next/server";

// Agent status endpoint - connects to OpenClaw gateway
export async function GET() {
  try {
    // Try to get gateway status
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:4440";
    
    let gatewayStatus = "unknown";
    let sessions: any[] = [];
    
    try {
      // Check if gateway is responding
      const healthRes = await fetch(`${gatewayUrl}/health`, { 
        signal: AbortSignal.timeout(2000) 
      });
      
      if (healthRes.ok) {
        gatewayStatus = "online";
        
        // Try to get sessions info (may need auth)
        // For now, just return online status
      } else {
        gatewayStatus = "degraded";
      }
    } catch {
      gatewayStatus = "offline";
    }

    // Determine agent status based on gateway
    let agentStatus: "idle" | "thinking" | "working" | "offline" = "idle";
    if (gatewayStatus === "offline") {
      agentStatus = "offline";
    }

    // Build activity log from recent actions
    // In a real implementation, this would track actual agent actions
    const now = new Date();
    const formatTime = (d: Date) => 
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

    const activityLog = [
      { time: formatTime(new Date(now.getTime() - 60000)), action: "Heartbeat OK" },
      { time: formatTime(new Date(now.getTime() - 120000)), action: "Session active" },
      { time: formatTime(now), action: `Gateway: ${gatewayStatus}` },
    ];

    return NextResponse.json({
      status: agentStatus,
      gateway: gatewayStatus,
      name: "Nimbus",
      version: "v0.1",
      uptime: process.uptime(),
      currentTask: agentStatus === "offline" ? "Gateway unreachable" : "Standing by",
      activityLog,
      lastSeen: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      status: "offline",
      gateway: "error",
      name: "Nimbus",
      version: "v0.1",
      error: error instanceof Error ? error.message : "Unknown error",
      activityLog: [],
      lastSeen: null,
    });
  }
}
