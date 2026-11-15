import http from "node:http";

// ─── Live reload local ──────────────────────────────────────────────────────
// El watcher abre un canal en 127.0.0.1 y la vista previa (solo ella) se
// conecta para recargarse al guardar. Nunca se expone fuera de la máquina:
// - bind explícito a 127.0.0.1
// - una sola ruta (GET /events), todo lo demás 404
// - sin datos del tema: solo avisa "cambió algo"

const HOST = "127.0.0.1";
const MIN_PORT = 1024;
const MAX_PORT = 65535;
const HEARTBEAT_MS = 15_000;

export interface LiveReloadServer {
  port: number;
  url: string;
  /** Avisa a las pestañas conectadas que recarguen. */
  notify(): void;
  /** Corta conexiones y libera el puerto. */
  close(): void;
}

/** Valida el puerto pedido por el usuario; null si no es usable. */
export function parseLivePort(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error("--live-port debe ser un número entre 1024 y 65535.");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error("--live-port debe estar entre 1024 y 65535.");
  }
  return port;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    // Chrome puede pedir permiso explícito para hablar con la red local.
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
  };
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

/** Busca un puerto libre en el rango permitido. */
async function listenFree(server: http.Server): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = MIN_PORT + Math.floor(Math.random() * 10000);
    try {
      return await listen(server, candidate);
    } catch {
      // Puerto ocupado: probar otro.
    }
  }
  throw new Error("No se encontró un puerto libre para el live reload.");
}

/**
 * Levanta el canal de recarga. Si `preferred` está ocupado, usa otro libre.
 */
export async function startLiveReloadServer(
  preferred?: number | null,
  onChange?: (clients: number) => void,
): Promise<LiveReloadServer> {
  const clients = new Set<http.ServerResponse>();
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    // Estricto: una sola ruta y solo GET.
    if (req.method !== "GET" || url.pathname !== "/events") {
      res.writeHead(404, { ...corsHeaders(), "Content-Type": "text/plain" });
      res.end("No encontrado");
      return;
    }

    res.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": conectado\n\n");
    clients.add(res);
    onChange?.(clients.size);

    const drop = () => {
      clients.delete(res);
      onChange?.(clients.size);
    };
    req.on("close", drop);
    req.on("error", drop);
  });

  let port: number;
  if (preferred) {
    try {
      port = await listen(server, preferred);
    } catch {
      port = await listenFree(server);
    }
  } else {
    port = await listenFree(server);
  }
  if (port < MIN_PORT || port > MAX_PORT) {
    server.close();
    throw new Error("El puerto del live reload quedó fuera del rango permitido.");
  }

  return {
    port,
    url: `http://${HOST}:${port}/events`,
    notify() {
      const data = JSON.stringify({ at: new Date().toISOString() });
      for (const res of clients) res.write(`event: reload\ndata: ${data}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // La pestaña ya se había cerrado.
        }
      }
      clients.clear();
      server.close();
    },
  };
}
