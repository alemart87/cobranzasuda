// Route Handler dedicado al chat del agente.
//
// Motivo: Next.js BUFFEREA las respuestas SSE cuando las proxea por `rewrites`
// (vercel/next.js#66263), así que el streaming del agente llegaba "de golpe".
// Acá proxeamos manualmente al backend y devolvemos el stream tal cual, con los
// headers anti-buffering (X-Accel-Buffering: no), en runtime Node y sin cache.
//
// Como este archivo existe en el filesystem, tiene prioridad sobre el rewrite
// para esta ruta exacta (GET = listar mensajes; POST = chat en streaming).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

function upstreamUrl(id: string) {
  return `${BACKEND}/api/v1/agent/conversations/${encodeURIComponent(id)}/messages`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = req.headers.get("authorization") || "";
  const upstream = await fetch(upstreamUrl(params.id), {
    method: "GET",
    headers: auth ? { Authorization: auth } : {},
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.text();

  const upstream = await fetch(upstreamUrl(params.id), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body,
  });

  // Si el backend respondió error (no stream), devolver el cuerpo tal cual.
  const ctype = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !ctype.includes("text/event-stream")) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": ctype || "application/json", "Cache-Control": "no-store" },
    });
  }

  // Stream SSE sin buffering.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
