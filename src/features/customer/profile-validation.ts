import { z } from "zod";
import { isPublicHttpsUrl } from "@/features/deals/validation";

export const SEX_VALUES = ["FEMALE", "MALE", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"] as const;
export const SEX_LABELS: Record<(typeof SEX_VALUES)[number], string> = {
  FEMALE: "Female", MALE: "Male", NON_BINARY: "Non-binary", OTHER: "Other", PREFER_NOT_TO_SAY: "Prefer not to say",
};

const noControlChars = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const MIN_DOB = Date.parse("1900-01-01");

/** All profile fields except the name are optional; empty strings mean "clear this field". */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80).refine(noControlChars, "Name contains invalid characters."),
  sex: z.enum(SEX_VALUES).nullable().optional(),
  dateOfBirth: z.union([z.literal(""), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")]).optional()
    .refine((value) => {
      if (!value) return true;
      const time = Date.parse(value + "T00:00:00Z");
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && time >= MIN_DOB && time <= Date.now();
    }, "Enter a real date of birth in the past."),
  location: z.string().trim().max(100, "Location is too long.").refine(noControlChars, "Location contains invalid characters.").nullable().optional(),
}).strict();
export type ProfileInput = z.infer<typeof profileSchema>;

const optionalText = (max: number) => z.string().trim().max(max).refine(noControlChars, "Contains invalid characters.").nullable().optional();

/** What a customer may send; amounts are paise. The customer id is never part of this payload. */
export const submissionSchema = z.object({
  title: z.string().trim().min(3, "Title needs at least 3 characters.").max(200).refine(noControlChars, "Title contains invalid characters."),
  brand: optionalText(100),
  description: z.string().trim().min(10, "Describe the deal in at least 10 characters.").max(2000),
  productUrl: z.string().trim().max(2048).transform((u) => u.replace(/^http:\/\//i, "https://")).refine(isPublicHttpsUrl, "Use a public HTTPS link to the product page."),
  merchantName: optionalText(100),
  categoryHint: optionalText(100),
  priceMinor: z.number().int("Enter a valid price.").min(100, "Price must be at least ₹1.").max(2_000_000_000),
  mrpMinor: z.number().int().min(100).max(2_000_000_000).nullable().optional(),
  couponCode: optionalText(50),
  imageUrl: z.string().trim().max(2048).refine(isPublicHttpsUrl, "Use a public https image link.").nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mrpMinor != null && value.priceMinor > value.mrpMinor) ctx.addIssue({ code: "custom", path: ["priceMinor"], message: "Deal price cannot be higher than the MRP." });
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

export const resubmitSchema = z.object({ version: z.number().int().positive() }).strict();
