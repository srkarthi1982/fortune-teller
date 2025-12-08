import type { ActionAPIContext } from "astro:actions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import {
  FortuneDraws,
  FortuneSessions,
  FortuneTemplates,
  and,
  db,
  eq,
  or,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

type Condition =
  | ReturnType<typeof eq>
  | ReturnType<typeof and>
  | ReturnType<typeof or>
  | undefined;

function combineConditions(conditions: Condition[]) {
  return conditions.filter(Boolean).reduce<Condition>(
    (acc, condition) => (acc ? and(acc, condition!) : condition),
    undefined,
  );
}

export const server = {
  listFortuneTemplates: defineAction({
    input: z.object({
      category: z.string().optional(),
      tone: z.string().optional(),
      includeInactive: z.boolean().default(false),
      includeSystem: z.boolean().default(true),
      includeMine: z.boolean().default(true),
    }),
    handler: async (input, context) => {
      const locals = context.locals as App.Locals | undefined;
      const userId = locals?.user?.id;

      if (!input.includeSystem && (!input.includeMine || !userId)) {
        return { success: true, data: { items: [], total: 0 } };
      }

      const visibilityCondition = input.includeSystem
        ? userId && input.includeMine
          ? or(eq(FortuneTemplates.isSystem, true), eq(FortuneTemplates.userId, userId))
          : eq(FortuneTemplates.isSystem, true)
        : eq(FortuneTemplates.userId, userId!);

      const conditions: Condition[] = [visibilityCondition];

      if (!input.includeInactive) {
        conditions.push(eq(FortuneTemplates.isActive, true));
      }

      if (input.category) {
        conditions.push(eq(FortuneTemplates.category, input.category));
      }

      if (input.tone) {
        conditions.push(eq(FortuneTemplates.tone, input.tone));
      }

      const whereClause = combineConditions(conditions);
      const items = whereClause
        ? await db.select().from(FortuneTemplates).where(whereClause)
        : await db.select().from(FortuneTemplates);

      return {
        success: true,
        data: { items, total: items.length },
      };
    },
  }),

  createFortuneTemplate: defineAction({
    input: z.object({
      title: z.string().optional(),
      body: z.string().min(1),
      category: z.string().optional(),
      tone: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const template = {
        id: crypto.randomUUID(),
        userId: user.id,
        title: input.title,
        body: input.body,
        category: input.category,
        tone: input.tone,
        isSystem: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof FortuneTemplates.$inferInsert;

      await db.insert(FortuneTemplates).values(template);

      return {
        success: true,
        data: { template },
      };
    },
  }),

  updateFortuneTemplate: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        title: z.string().optional(),
        body: z.string().min(1).optional(),
        category: z.string().optional(),
        tone: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .refine(
        (updateInput) =>
          updateInput.title !== undefined ||
          updateInput.body !== undefined ||
          updateInput.category !== undefined ||
          updateInput.tone !== undefined ||
          updateInput.isActive !== undefined,
        { message: "At least one field must be provided." },
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      const [existing] = await db
        .select()
        .from(FortuneTemplates)
        .where(eq(FortuneTemplates.id, input.id));

      if (!existing) {
        throw new ActionError({ code: "NOT_FOUND", message: "Template not found." });
      }

      if (existing.userId !== user.id) {
        throw new ActionError({ code: "FORBIDDEN", message: "You cannot modify this template." });
      }

      if (existing.isSystem) {
        throw new ActionError({ code: "FORBIDDEN", message: "System templates cannot be edited." });
      }

      const updates: Partial<typeof FortuneTemplates.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body;
      if (input.category !== undefined) updates.category = input.category;
      if (input.tone !== undefined) updates.tone = input.tone;
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      await db.update(FortuneTemplates).set(updates).where(eq(FortuneTemplates.id, input.id));

      const [template] = await db
        .select()
        .from(FortuneTemplates)
        .where(eq(FortuneTemplates.id, input.id));

      return {
        success: true,
        data: { template },
      };
    },
  }),

  archiveFortuneTemplate: defineAction({
    input: z.object({ id: z.string().min(1) }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const [existing] = await db
        .select()
        .from(FortuneTemplates)
        .where(eq(FortuneTemplates.id, input.id));

      if (!existing) {
        throw new ActionError({ code: "NOT_FOUND", message: "Template not found." });
      }

      if (existing.userId !== user.id) {
        throw new ActionError({ code: "FORBIDDEN", message: "You cannot archive this template." });
      }

      await db
        .update(FortuneTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(FortuneTemplates.id, input.id));

      return { success: true };
    },
  }),

  createFortuneSession: defineAction({
    input: z.object({
      question: z.string().optional(),
      spreadType: z.string().optional(),
      notes: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const session = {
        id: crypto.randomUUID(),
        userId: user.id,
        question: input.question,
        spreadType: input.spreadType,
        notes: input.notes,
        createdAt: new Date(),
      } satisfies typeof FortuneSessions.$inferInsert;

      await db.insert(FortuneSessions).values(session);

      return {
        success: true,
        data: { session },
      };
    },
  }),

  listMyFortuneSessions: defineAction({
    input: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const page = Math.max(1, input.page);
      const pageSize = Math.min(100, Math.max(1, input.pageSize));
      const offset = (page - 1) * pageSize;

      const items = await db
        .select()
        .from(FortuneSessions)
        .where(eq(FortuneSessions.userId, user.id))
        .limit(pageSize)
        .offset(offset);

      return {
        success: true,
        data: { items, total: items.length, page, pageSize },
      };
    },
  }),

  getFortuneSessionWithDraws: defineAction({
    input: z.object({ sessionId: z.string().min(1) }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(FortuneSessions)
        .where(eq(FortuneSessions.id, input.sessionId));

      if (!session) {
        throw new ActionError({ code: "NOT_FOUND", message: "Session not found." });
      }

      if (session.userId !== user.id) {
        throw new ActionError({ code: "FORBIDDEN", message: "You cannot view this session." });
      }

      const draws = await db
        .select()
        .from(FortuneDraws)
        .where(eq(FortuneDraws.sessionId, input.sessionId));

      return {
        success: true,
        data: { session, draws },
      };
    },
  }),

  addFortuneDraw: defineAction({
    input: z.object({
      sessionId: z.string().min(1),
      fortuneTemplateId: z.string().optional(),
      positionIndex: z.number().int().positive().optional(),
      interpretedText: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(FortuneSessions)
        .where(eq(FortuneSessions.id, input.sessionId));

      if (!session) {
        throw new ActionError({ code: "NOT_FOUND", message: "Session not found." });
      }

      if (session.userId !== user.id) {
        throw new ActionError({ code: "FORBIDDEN", message: "You cannot modify this session." });
      }

      if (input.fortuneTemplateId) {
        const [template] = await db
          .select()
          .from(FortuneTemplates)
          .where(eq(FortuneTemplates.id, input.fortuneTemplateId));

        if (!template) {
          throw new ActionError({ code: "NOT_FOUND", message: "Template not found." });
        }

        if (template.isSystem === false && template.userId !== user.id) {
          throw new ActionError({ code: "FORBIDDEN", message: "You cannot use this template." });
        }

        if (!template.isActive) {
          throw new ActionError({ code: "BAD_REQUEST", message: "Template is inactive." });
        }
      }

      const draw = {
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        fortuneTemplateId: input.fortuneTemplateId,
        positionIndex: input.positionIndex,
        interpretedText: input.interpretedText,
        createdAt: new Date(),
      } satisfies typeof FortuneDraws.$inferInsert;

      await db.insert(FortuneDraws).values(draw);

      return {
        success: true,
        data: { draw },
      };
    },
  }),
};
