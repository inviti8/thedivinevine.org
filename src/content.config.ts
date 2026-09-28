import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const products = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/products' }),
  schema: z.object({
    name: z.string(),
    category: reference('categories'),
    priceUsd: z.number().positive(),
    size: z.string(),
    weightOz: z.number().positive(),
    botanicalNames: z.array(z.string()).default([]),
    ingredients: z.array(z.string()).min(1),
    usage: z.string(),
    // Required: pregnancy/nursing, interactions, allergens (DESIGN.md §9).
    cautions: z.array(z.string()).min(1),
    primaryImage: z.string(),
    gallery: z.array(z.string()).default([]),
    inStock: z.boolean().default(true),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/categories' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    heroImage: z.string().optional(),
    order: z.number().default(99),
  }),
});

const journal = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    publishedDate: z.date(),
    author: z.string().default('The Divine Vine'),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { products, categories, journal };
