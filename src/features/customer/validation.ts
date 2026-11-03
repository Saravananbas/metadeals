import { z } from "zod";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80), email: emailSchema,
  password: z.string().min(8).max(128), confirmPassword: z.string().max(128)
}).strict().refine(v => v.password === v.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });
export const verifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export const resendSchema = verifySchema.pick({ challengeId: true });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export function verifiedProviderEmail(profile: { email?: unknown; email_verified?: unknown }) {
  return typeof profile.email === "string" && emailSchema.safeParse(profile.email).success &&
    (profile.email_verified === true || profile.email_verified === "true");
}
