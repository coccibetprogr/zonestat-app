export const runtime = "edge";
export async function GET() {
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
}
export async function POST(req: Request) {
  const url = new URL(req.url);
  return Response.json({ ok: true, path: url.pathname });
}
