// src/utils/observability/log.ts
type Lvl = "debug" | "info" | "warn" | "error";

async function sendWebhook(payload: any) {
  try {
    const url = process.env.LOG_WEBHOOK_URL;
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // hint pour edge/runtime
    });
  } catch {
    // on ne fait pas échouer l'app pour un log
  }
}

function emit(level: Lvl, message: string, meta?: Record<string, unknown>) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    message,
    ...((meta && Object.keys(meta).length) ? { meta } : {}),
  };
  // sortie console JSON
  // eslint-disable-next-line no-console
  (console as any)[level === "debug" ? "log" : level](JSON.stringify(rec));
  // expédition optionnelle
  void sendWebhook(rec);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
