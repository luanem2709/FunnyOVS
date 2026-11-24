export type AddonSet = { name?: string; hint?: string; actors?: boolean; svg: string | { day?: string; night?: string; sunset?: string; dawn?: string } };
export type AddonProp = { name?: string; w?: number; h?: number; svg: string };
export type AddonCast = { name?: string; base?: string; size?: number; look?: Record<string, string | boolean> };
export const ADDONS: { sets: Record<string, AddonSet>; props: Record<string, AddonProp>; casts?: Record<string, AddonCast> };
