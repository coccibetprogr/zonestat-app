// middleware.ts (safe debug)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/', '/__mw-ping', '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

export default function middleware(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // route de ping: réponse immédiate
    if (url.pathname.endsWith('/__mw-ping')) {
      return new Response(null, {
        status: 204,
        headers: {
          'x-middleware-active': '1',
          'x-middleware-path': url.pathname,
        },
      });
    }

    // chemin normal: on tag et on laisse passer
    const res = NextResponse.next();
    res.headers.set('x-middleware-active', '1');
    res.headers.set('x-middleware-path', url.pathname);
    return res;
  } catch (e: any) {
    // Ne JAMAIS throw: on renvoie une 520 avec le message en header
    const msg = (e && e.message) ? e.message : String(e);
    return new Response('mw-error', {
      status: 520,
      headers: {
        'x-middleware-error': msg,
      },
    });
  }
}
