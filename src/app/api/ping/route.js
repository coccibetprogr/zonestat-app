export async function POST(req) {
  const url = new URL(req.url);
  return new Response(JSON.stringify({ ok: true, path: url.pathname }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
export function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
