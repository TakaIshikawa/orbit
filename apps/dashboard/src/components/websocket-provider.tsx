"use client";

import { createContext, useContext, ReactNode } from "react";
import { useWebSocket, type EventType, type ServerEvent } from "@/lib/websocket";

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (events?: EventType[]) => void;
  unsubscribe: (events?: EventType[]) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  onEvent?: (event: ServerEvent) => void;
}

export function WebSocketProvider({ children, onEvent }: WebSocketProviderProps) {
  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    autoInvalidate: true,
    onEvent,
  });

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
}
