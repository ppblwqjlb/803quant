import net from "node:net";

import { Client } from "ssh2";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function boundedIntegerEnv(name, fallback, maximum) {
  const rawValue = process.env[name]?.trim();
  const value = rawValue ? Number(rawValue) : fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

const settings = {
  sshHost: requireEnv("SSH_TUNNEL_HOST"),
  sshPort: boundedIntegerEnv("SSH_TUNNEL_PORT", 22, 65_535),
  sshUser: requireEnv("SSH_TUNNEL_USER"),
  sshPassword: requireEnv("SSH_TUNNEL_PASSWORD"),
  remoteHost: process.env.SSH_TUNNEL_REMOTE_HOST?.trim() || "127.0.0.1",
  remotePort: boundedIntegerEnv("SSH_TUNNEL_REMOTE_PORT", 3306, 65_535),
  localHost: process.env.SSH_TUNNEL_LOCAL_HOST?.trim() || "127.0.0.1",
  localPort: boundedIntegerEnv("SSH_TUNNEL_LOCAL_PORT", 3306, 65_535),
  reconnectDelayMs: 3_000,
};

let client = null;
let server = null;
let shuttingDown = false;
let reconnectTimer = null;

function log(message) {
  console.log(`[db-tunnel] ${message}`);
}

function closeServer() {
  if (!server) return Promise.resolve();
  const current = server;
  server = null;
  return new Promise((resolve) => current.close(() => resolve()));
}

function closeClient() {
  if (!client) return;
  const current = client;
  client = null;
  try {
    current.end();
  } catch {
    current.destroy();
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void start();
  }, settings.reconnectDelayMs);
}

async function start() {
  closeClient();
  await closeServer();
  if (shuttingDown) return;

  const current = new Client();
  client = current;

  current.on("ready", () => {
    if (shuttingDown || client !== current) {
      current.end();
      return;
    }
    log(`SSH connected to ${settings.sshHost}:${settings.sshPort}`);

    const local = net.createServer((socket) => {
      const sourceAddress = socket.remoteAddress ?? "127.0.0.1";
      const sourcePort = socket.remotePort ?? 0;
      current.forwardOut(
        sourceAddress,
        sourcePort,
        settings.remoteHost,
        settings.remotePort,
        (error, stream) => {
          if (error) {
            log(`forward failed: ${error.message}`);
            socket.destroy();
            return;
          }
          socket.on("error", () => stream.destroy());
          stream.on("error", () => socket.destroy());
          socket.pipe(stream).pipe(socket);
        },
      );
    });

    local.on("error", (error) => {
      log(`local listener error: ${error.message}`);
      process.exitCode = 1;
      void shutdown();
    });

    local.listen(settings.localPort, settings.localHost, () => {
      server = local;
      log(`ready: ${settings.localHost}:${settings.localPort} -> ${settings.remoteHost}:${settings.remotePort} via ${settings.sshHost}`);
    });
  });

  current.on("error", (error) => {
    if (client === current) log(`SSH error: ${error.message}`);
  });

  current.on("close", () => {
    if (client !== current) return;
    client = null;
    void closeServer().then(() => {
      if (shuttingDown) return;
      log("SSH connection closed; reconnecting");
      scheduleReconnect();
    });
  });

  current.connect({
    host: settings.sshHost,
    port: settings.sshPort,
    username: settings.sshUser,
    password: settings.sshPassword,
    keepaliveInterval: 15_000,
    keepaliveCountMax: 4,
    readyTimeout: 20_000,
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  closeClient();
  await closeServer();
}

process.on("SIGINT", () => {
  log("stopping");
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await start();

const isMainModule = true;
void isMainModule;
