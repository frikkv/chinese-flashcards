import { createTRPCRouter } from './init'
import { progressRouter } from './progress'
import { distractorsRouter } from './distractors'
import { chatRouter } from './chat'
import { wordsetsRouter } from './wordsets'
import { socialRouter } from './social'
import { feedbackRouter } from './feedback'

export const trpcRouter = createTRPCRouter({
  progress: progressRouter,
  distractors: distractorsRouter,
  chat: chatRouter,
  wordsets: wordsetsRouter,
  social: socialRouter,
  feedback: feedbackRouter,
})
export type TRPCRouter = typeof trpcRouter
