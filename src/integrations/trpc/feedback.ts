import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { createTRPCRouter, protectedProcedure } from './init'
import { db } from '#/db'
import { feedback } from '#/db/schema'

export const feedbackRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(
      z.object({
        type: z.enum(['feedback', 'feature', 'bug']),
        message: z.string().min(3).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db.insert(feedback).values({
        id: crypto.randomUUID(),
        userId,
        type: input.type,
        message: input.message,
        createdAt: new Date(),
      })
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    return db
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt))
      .limit(50)
  }),
})
