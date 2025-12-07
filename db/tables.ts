/**
 * Fortune Teller - fun fortune draws (cards, messages, etc.).
 *
 * Design goals:
 * - Fortune templates (system or user-generated).
 * - Sessions where user asks a question.
 * - Draws linking session to one or more fortunes.
 */

import { defineTable, column, NOW } from "astro:db";

export const FortuneTemplates = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    // null => system fortune template
    userId: column.text({ optional: true }),

    title: column.text({ optional: true }),           // "Opportunity ahead", etc.
    body: column.text(),                              // main fortune text
    category: column.text({ optional: true }),        // "career", "love", "general"
    tone: column.text({ optional: true }),            // "optimistic", "balanced", etc.

    isSystem: column.boolean({ default: false }),
    isActive: column.boolean({ default: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const FortuneSessions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    question: column.text({ optional: true }),        // user's question/intention
    spreadType: column.text({ optional: true }),      // "single-card", "three-card", etc.
    notes: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const FortuneDraws = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    sessionId: column.text({
      references: () => FortuneSessions.columns.id,
    }),
    fortuneTemplateId: column.text({
      references: () => FortuneTemplates.columns.id,
      optional: true,
    }),

    positionIndex: column.number({ optional: true }), // 1,2,3 in a spread
    interpretedText: column.text({ optional: true }), // AI/custom interpretation for this draw

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  FortuneTemplates,
  FortuneSessions,
  FortuneDraws,
} as const;
