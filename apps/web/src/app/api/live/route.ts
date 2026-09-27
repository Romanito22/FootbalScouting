import { fetchLiveStatus } from '@/lib/live';

/**
 * Flux Server-Sent Events : l'état des données, poussé à chaque changement
 * (et un battement toutes les 3 s pour garder la connexion). Outil local
 * mono-utilisateur : un sondage de la base toutes les 3 s par onglet ouvert
 * est négligeable.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POLL_MS = 3000;

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = '';
      const push = async () => {
        if (closed) return;
        try {
          const payload = JSON.stringify(await fetchLiveStatus());
          controller.enqueue(encoder.encode(
            payload === last ? ': battement\n\n' : `event: status\ndata: ${payload}\n\n`,
          ));
          last = payload;
        } catch {
          controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n'));
        }
      };
      const stop = () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* déjà fermé */ }
      };
      request.signal.addEventListener('abort', stop);
      await push();
      timer = setInterval(() => { void push(); }, POLL_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
