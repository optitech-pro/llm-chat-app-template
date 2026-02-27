// ============================================================
//  LLM Chat Application — Cloudflare Workers AI
//  OptiTech Sverige
// ============================================================

const MODEL_ID      = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://optitech-sverige.se",
  "https://www.optitech-sverige.se",
];

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Huvud-handler ─────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const origin       = request.headers.get("Origin") ?? "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin":  allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    };

    // Hantera CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Statiska tillgångar
    if (pathname === "/" || !pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Chat-endpoint
    if (pathname === "/api/chat") {
      return request.method === "POST"
        ? handleChatRequest(request, env, corsHeaders)
        : new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ── Chat-hanterare ────────────────────────────────────────────
async function handleChatRequest(
  request:     Request,
  env:         Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    // Validera API-nyckel
    const apiKey = request.headers.get("x-api-key");
    if (apiKey !== env.api) {
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body     = await request.json<{ messages?: ChatMessage[] }>();
    const messages: ChatMessage[] = body.messages ?? [];

    // Injicera system-prompt om saknas
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const stream = await env.AI.run(
      MODEL_ID,
      { messages, max_tokens: 1024, stream: true }
    );

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "content-type":  "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "connection":    "keep-alive",
      },
    });

  } catch (error) {
    console.error("[Chat] Fel:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status:  500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }
}
