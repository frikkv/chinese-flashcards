import { createTRPCRouter } from './init'

export const trpcRouter = createTRPCRouter({})
export type TRPCRouter = typeof trpcRouter
