import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleSocialQualifyForm, handleCheckUserExists } from "./routes/social-qualify-form";
import { handleContractorRequest } from "./routes/contractor-request";

// Log environment configuration at startup
console.log("==================== SERVER STARTUP ====================");
console.log("Environment variables status:");
console.log("- NODE_ENV:", process.env.NODE_ENV || "not set");
console.log("- DATABASE_URL:", process.env.DATABASE_URL ? "configured (Neon PostgreSQL)" : "NOT SET");
console.log("- REDDIT_CLIENT_ID:", process.env.REDDIT_CLIENT_ID ? "configured" : "NOT SET");
console.log("- REDDIT_CLIENT_SECRET:", process.env.REDDIT_CLIENT_SECRET ? "configured" : "NOT SET");
console.log("========================================================");

/**
 * Formats error response based on environment.
 * In development mode, includes stack trace for debugging.
 * In production/test, omits stack trace for security.
 */
export function formatErrorResponse(err: Error, nodeEnv?: string): { success: boolean; message: string; error?: string } {
  const env = nodeEnv ?? process.env.NODE_ENV;
  return {
    success: false,
    message: `Server error: ${err.message}`,
    error: env === 'development' ? err.stack : undefined
  };
}

export function createServer() {
  const app = express();

  // Request logging middleware
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[SERVER] ${timestamp} ${req.method} ${req.url}`);
    console.log(`[SERVER] Headers:`, JSON.stringify(req.headers, null, 2));

    // Log response when it's sent
    const originalSend = res.send;
    res.send = function(data) {
      console.log(`[SERVER] Response ${res.statusCode} for ${req.method} ${req.url}`);
      return originalSend.call(this, data);
    };

    next();
  });

  // Middleware
  app.use(cors());
  app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
  app.use(express.text({ type: 'text/plain', limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // FairDataUse API routes
  app.post("/api/check-user-exists", handleCheckUserExists);
  app.post("/api/social-qualify-form", handleSocialQualifyForm);
  app.post("/api/contractor-request", handleContractorRequest);

  // Global error handling middleware (must be last)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[SERVER] ==================== UNHANDLED ERROR ====================");
    console.error("[SERVER] Error type:", err.constructor.name);
    console.error("[SERVER] Error message:", err.message);
    console.error("[SERVER] Error stack:", err.stack);
    console.error("[SERVER] Request URL:", req.url);
    console.error("[SERVER] Request method:", req.method);
    console.error("[SERVER] Request body:", JSON.stringify(req.body, null, 2));
    console.error("[SERVER] ===========================================================");

    if (!res.headersSent) {
      const errorResponse = formatErrorResponse(err);
      res.status(500).json(errorResponse);
    }
  });

  return app;
}
