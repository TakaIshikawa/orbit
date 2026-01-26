import { EventEmitter } from "node:events";
import type { EventType, ServerEvent } from "./types.js";

class EventBus extends EventEmitter {
  publish(type: EventType, payload: Record<string, unknown>): void {
    const event: ServerEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.emit("event", event);
    this.emit(type, event);
  }
}

export const eventBus = new EventBus();
