import { z } from "zod";

export const EventTypeSchema = z.enum([
  "pattern.created",
  "pattern.updated",
  "pattern.deleted",
  "issue.created",
  "issue.updated",
  "issue.deleted",
  "issue.archived",
  "issue.unarchived",
  "solution.created",
  "solution.updated",
  "solution.deleted",
  "solution.outcome.recorded",
  "run.started",
  "run.updated",
  "run.completed",
  "playbook.created",
  "playbook.updated",
  "playbook.deleted",
  "feedback.created",
  "discovery.profile.created",
  "discovery.profile.updated",
  "discovery.profile.deleted",
  "discovery.profile.scheduled",
  "discovery.profile.unscheduled",
  "discovery.run.started",
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const ServerEventSchema = z.object({
  type: EventTypeSchema,
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    events: z.array(EventTypeSchema).optional(),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    events: z.array(EventTypeSchema).optional(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
