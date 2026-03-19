/**
 * Demo Auth Configuration
 *
 * Set DEMO_AUTH to true to bypass real authentication and use a mock user.
 * This is useful for preview/demo purposes only.
 *
 * IMPORTANT: Set to false before deploying to production!
 */
export const DEMO_AUTH = true

export const DEMO_USER = {
  id: 'demo-user',
  name: 'Demo User',
  email: 'demo@example.com',
  image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo-user',
  username: 'demo',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const DEMO_SESSION = {
  user: DEMO_USER,
  session: {
    id: 'demo-session',
    userId: 'demo-user',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
    createdAt: new Date(),
    updatedAt: new Date(),
    token: 'demo-token',
  },
}
