// src/utils/observability/log.ts
type Lvl = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;
type LogRecord = {
  ts: string;
  level: Lvl;
  message: string;
  meta?: LogMeta;
};

async function sendWebhook(payload: LogRecord) {
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

function emit(level: Lvl, message: string, meta?: LogMeta) {
  const rec: LogRecord = {
    ts: new Date().toISOString(),
    level,
    message,
    ...((meta && Object.keys(meta).length) ? { meta } : {}),
  };
  // sortie console JSON
  const consoleMethod: "log" | "info" | "warn" | "error" =
    level === "debug" ? "log" : level;
  // eslint-disable-next-line no-console
  console[consoleMethod](JSON.stringify(rec));
  // expédition optionnelle
  void sendWebhook(rec);
}

export const log = {
  debug: (msg: string, meta?: LogMeta) => emit("debug", msg, meta),
  info:  (msg: string, meta?: LogMeta) => emit("info", msg, meta),
  warn:  (msg: string, meta?: LogMeta) => emit("warn", msg, meta),
  error: (msg: string, meta?: LogMeta) => emit("error", msg, meta),
};
