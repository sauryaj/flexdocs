import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const THEMES = ['light', 'dark', 'system'];
const ACCENTS = ['blue', 'purple', 'teal', 'green', 'orange', 'red', 'pink', 'indigo'];
const EFFECTS = ['none', 'star', 'glow', 'glass', 'gradient'];
const DENSITIES = ['comfortable', 'compact'];
const FONT_SCALES = ['sm', 'md', 'lg'];

function sanitize(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof src.theme === 'string' && THEMES.includes(src.theme)) out.theme = src.theme;
  if (typeof src.accent === 'string' && (ACCENTS.includes(src.accent) || src.accent === 'custom')) {
    out.accent = src.accent;
  }
  if (typeof src.customAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(src.customAccent)) {
    out.customAccent = src.customAccent.toLowerCase();
  }
  if (typeof src.effect === 'string' && EFFECTS.includes(src.effect)) out.effect = src.effect;
  if (typeof src.density === 'string' && DENSITIES.includes(src.density)) out.density = src.density;
  if (typeof src.fontScale === 'string' && FONT_SCALES.includes(src.fontScale)) out.fontScale = src.fontScale;
  if (typeof src.highContrast === 'boolean') out.highContrast = src.highContrast;
  if (typeof src.reducedMotion === 'boolean') out.reducedMotion = src.reducedMotion;
  return out;
}

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { themePrefs: true } });
  return NextResponse.json(sanitize(row?.themePrefs));
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const prefs = sanitize(body);
  // A custom accent requires a valid hex; otherwise fall back to a preset
  if (prefs.accent === 'custom' && !prefs.customAccent) {
    delete prefs.accent;
    delete prefs.customAccent;
  }
  await prisma.user.update({ where: { id: user.id }, data: { themePrefs: prefs as object } });
  return NextResponse.json(prefs);
}
