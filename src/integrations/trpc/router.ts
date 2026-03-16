import { createTRPCRouter } from './init'
import { progressRouter } from './progress'
import { distractorsRouter } from './distractors'
import { chatRouter } from './chat'
import { wordsetsRouter } from './wordsets'

export const trpcRouter = createTRPCRouter({
  progress: progressRouter,
  distractors: distractorsRouter,
  chat: chatRouter,
  wordsets: wordsetsRouter,
})
export type TRPCRouter = typeof trpcRouter
