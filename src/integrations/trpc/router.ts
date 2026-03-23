import { createTRPCRouter } from './init'
import { progressRouter } from './progress'
import { distractorsRouter } from './distractors'
import { chatRouter } from './chat'
import { wordsetsRouter } from './wordsets'
import { socialRouter } from './social'
import { feedbackRouter } from './feedback'
import { adminRouter } from './admin'
import { announcementsRouter } from './announcements'

export const trpcRouter = createTRPCRouter({
  progress: progressRouter,
  distractors: distractorsRouter,
  chat: chatRouter,
  wordsets: wordsetsRouter,
  social: socialRouter,
  feedback: feedbackRouter,
  admin: adminRouter,
  announcements: announcementsRouter,
})
export type TRPCRouter = typeof trpcRouter
