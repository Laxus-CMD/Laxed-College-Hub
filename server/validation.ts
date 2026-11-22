import { z } from 'zod'

/** Input rules for the API. Every request body goes through one of these, and unknown keys are rejected. */

export const email = z.string().trim().toLowerCase().max(254, 'Email is too long.').pipe(z.email('Enter a valid email address.'))

// Letters, marks, numbers, spaces and common name punctuation. No control characters or markup.
const NAME = /^[\p{L}\p{M}\p{N} .,'’-]+$/u

export const name = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(60, 'Name must be 60 characters or fewer.')
  .regex(NAME, 'Name can only use letters, numbers, spaces and . , \' -')

/** A few passwords that pass the length rule but are still guessed first. */
const COMMON = new Set([
  'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop', 'iloveyou123',
  'letmein1234', 'welcome1234', 'admin12345', 'qwerty12345', 'collegehub1', 'dlsu123456',
])

// NIST SP 800-63B: length over composition rules, a block list, and a generous maximum.
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'That password is too common. Pick another.')
  .refine((p) => new Set(p).size >= 4, 'That password is too easy to guess. Pick another.')

export const signupBody = z
  .strictObject({ name, email, password })
  .refine((b) => {
    const local = b.email.split('@')[0]!
    return local.length < 4 || !b.password.toLowerCase().includes(local)
  }, {
    path: ['password'],
    message: 'Password must not contain your email.',
  })

export const loginBody = z.strictObject({
  email,
  // Only a length cap on login, so a rule change never locks out old passwords.
  password: z.string().min(1, 'Enter your password.').max(128),
})

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
})

export const googleBody = z.strictObject({ credential: z.string().min(20).max(4096) })

/** Deleting an account needs the password, or the typed email for accounts that only use Google. */
export const deleteAccountBody = z.strictObject({
  password: z.string().max(128).optional(),
  email: z.string().trim().toLowerCase().max(254).optional(),
})

export const role = z.enum(['admin', 'user'])

export const updateUserBody = z
  .strictObject({ role: role.optional(), isActive: z.boolean().optional() })
  .refine((b) => b.role !== undefined || b.isActive !== undefined, 'Nothing to change.')

export const userId = z.uuid('Unknown user.')

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Turns a ZodError into `{ field: message }` for the client. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    out[key] ??= issue.message
  }
  return out
}
