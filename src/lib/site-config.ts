// Owner-editable config (src/data/*.json), validated at import so a bad edit
// fails the build instead of breaking checkout or booking at runtime.
import { z } from 'astro/zod';
import bookingRaw from '~/data/booking.json';
import shopRaw from '~/data/shop.json';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');
const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const meetingSchema = z.object({
  format: z.enum(['video', 'phone', 'in-person']),
  url: z.string().url().or(z.literal('')),
  note: z.string(),
});

const bookingSchema = z.object({
  timezone: z.string(),
  weeklyHours: z.record(weekday, z.array(z.tuple([hhmm, hhmm]))),
  slotIntervalMin: z.number().int().positive(),
  bufferMin: z.number().int().nonnegative(),
  minNoticeHours: z.number().nonnegative(),
  horizonDays: z.number().int().positive(),
  holdMinutes: z.number().int().positive(),
  meeting: meetingSchema,
  types: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        name: z.string(),
        mode: z.enum(['paid', 'request']),
        durationMin: z.number().int().positive(),
        priceUsd: z.number().nonnegative(),
        description: z.string(),
        meeting: meetingSchema.optional(),
      })
    )
    .min(1)
    .refine((types) => types.every((t) => t.mode !== 'paid' || t.priceUsd > 0), 'paid types need priceUsd > 0'),
});

const shopSchema = z.object({
  allowedCountries: z.array(z.string().length(2)).min(1),
  maxQuantityPerItem: z.number().int().positive(),
  freeShippingThresholdUsd: z.number().nonnegative(),
  shippingOptions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        amountUsd: z.number().nonnegative(),
        minDays: z.number().int().positive(),
        maxDays: z.number().int().positive(),
        freeOverThreshold: z.boolean(),
      })
    )
    .min(1),
});

export type BookingConfig = z.infer<typeof bookingSchema>;
export type ConsultationType = BookingConfig['types'][number];
export type ShopConfig = z.infer<typeof shopSchema>;

export const booking: BookingConfig = bookingSchema.parse(bookingRaw);
export const shop: ShopConfig = shopSchema.parse(shopRaw);

export const formatUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
