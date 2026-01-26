import type { Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import { eventBus } from "./bus.js";
import { ClientMessageSchema, type EventType, type ServerEvent } from "./types.js";

interface ClientState {
  subscriptions: Set<EventType> | "all";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients = new Map<any, ClientState>();
const OPEN = 1; // WebSocket.OPEN constant

export async function setupWebSocket(server: HttpServer): Promise<void> {
  const require = createRequire(import.meta.url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let WebSocketServer: any;
  try {
    const wsModule = require("ws");
    WebSocketServer = wsModule.WebSocketServer;
  } catch {
    console.warn("WebSocket server disabled: 'ws' package not installed");
    console.warn("Run 'npm install ws' to enable real-time updates");
    return;
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wss.on("connection", (wsClient: any) => {
    // Default: subscribe to all events
    clients.set(wsClient, { subscriptions: "all" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wsClient.on("message", (data: any) => {
      try {
        const message = ClientMessageSchema.parse(JSON.parse(data.toString()));
        const state = clients.get(wsClient);
        if (!state) return;

        switch (message.type) {
          case "subscribe":
            if (message.events) {
              if (state.subscriptions === "all") {
                state.subscriptions = new Set(message.events);
              } else {
                message.events.forEach((e) => (state.subscriptions as Set<EventType>).add(e));
              }
            } else {
              state.subscriptions = "all";
            }
            break;

          case "unsubscribe":
            if (message.events && state.subscriptions !== "all") {
              message.events.forEach((e) => (state.subscriptions as Set<EventType>).delete(e));
            } else if (!message.events) {
              state.subscriptions = new Set();
            }
            break;

          case "ping":
            wsClient.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
            break;
        }
      } catch {
        wsClient.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    wsClient.on("close", () => {
      clients.delete(wsClient);
    });

    wsClient.on("error", () => {
      clients.delete(wsClient);
    });

    // Send connected message
    wsClient.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  });

  // Forward events to subscribed clients
  eventBus.on("event", (event: ServerEvent) => {
    const message = JSON.stringify(event);

    for (const [wsClient, state] of clients) {
      if (wsClient.readyState !== OPEN) continue;

      const shouldSend =
        state.subscriptions === "all" ||
        state.subscriptions.has(event.type);

      if (shouldSend) {
        wsClient.send(message);
      }
    }
  });

  console.log("WebSocket server ready on /ws");
}
