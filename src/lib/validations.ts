import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const documentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().optional(),
  category: z.string().optional(),
  folderId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const passwordSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  url: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const domainSchema = z.object({
  name: z.string().min(1, 'Domain name is required'),
  registrar: z.string().optional(),
  nameservers: z.string().optional(),
  expiresAt: z.string().optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
