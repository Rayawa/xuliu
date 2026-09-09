import { z } from "zod";

export const aiChatRequestSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  messages: z.array(z.unknown()).min(1).max(30),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  messageId: z.string().trim().min(1).max(128).optional(),
  activeWorkspaceOwner: z.string().max(30).optional(),
  activeCourseId: z.string().trim().min(1).max(120).optional(),
}).strict();
