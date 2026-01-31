"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type EventType =
  | "pattern.created"
  | "pattern.updated"
  | "pattern.deleted"
  | "issue.created"
  | "issue.updated"
  | "issue.deleted"
  | "solution.created"
  | "solution.updated"
  | "solution.deleted"
  | "run.started"
  | "run.updated"
  | "run.completed"
  | "playbook.created"
  | "playbook.updated"
  | "playbook.deleted";

export interface ServerEvent {
  type: EventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface UseWebSocketOptions {
  url?: string;
  onEvent?: (event: ServerEvent) => void;
  autoInvalidate?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// WebSocket connects to the API server; default port matches .env PORT setting
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4921/ws";

// Map event types to query keys for auto-invalidation
const eventToQueryKey: Record<string, string[]> = {
  "pattern.created": ["patterns"],
  "pattern.updated": ["patterns"],
  "pattern.deleted": ["patterns"],
  "issue.created": ["issues"],
  "issue.updated": ["issues"],
  "issue.deleted": ["issues"],
  "solution.created": ["solutions"],
  "solution.updated": ["solutions"],
  "solution.deleted": ["solutions"],
  "run.started": ["runs"],
  "run.updated": ["runs"],
  "run.completed": ["runs"],
  "playbook.created": ["playbooks"],
  "playbook.updated": ["playbooks"],
  "playbook.deleted": ["playbooks"],
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = WS_URL,
    onEvent,
    autoInvalidate = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle pong and connected messages
          if (data.type === "pong" || data.type === "connected") {
            return;
          }

          // Handle server events
          if (data.type && eventToQueryKey[data.type]) {
            const serverEvent = data as ServerEvent;

            // Auto-invalidate queries
            if (autoInvalidate) {
              const queryKeys = eventToQueryKey[serverEvent.type];
              queryKeys.forEach((key) => {
                queryClient.invalidateQueries({ queryKey: [key] });
              });
            }

            // Call custom handler
            onEvent?.(serverEvent);
          }
        } catch {
          // Ignore parsing errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, will retry
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      }
    }
  }, [url, onEvent, autoInvalidate, reconnectInterval, maxReconnectAttempts, queryClient]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const subscribe = useCallback((events?: EventType[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", events }));
    }
  }, []);

  const unsubscribe = useCallback((events?: EventType[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", events }));
    }
  }, []);

  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    ping,
  };
}
