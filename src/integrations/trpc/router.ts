import { createTRPCRouter } from './init'
import { progressRouter } from './progress'
import { distractorsRouter } from './distractors'
import { chatRouter } from './chat'

export const trpcRouter = createTRPCRouter({
  progress: progressRouter,
  distractors: distractorsRouter,
  chat: chatRouter,
})
export type TRPCRouter = typeof trpcRouter
