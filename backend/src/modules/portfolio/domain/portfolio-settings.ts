import { SETTING_DEFAULTS, type SettingKey } from '@axiom/contracts';
import { isValidTimeZone } from './calendar/business-calendar';

/** Parámetros de la rotación (tabla `settings`). */
export interface PortfolioSettings {
  cycleWeeks: number;
  weeklyQuota: number;
  maxCyclesWithoutProgress: number;
  timezone: string;
  /** Tamaño objetivo de cartera por ejecutivo = cycleWeeks × weeklyQuota. */
  portfolioSize: number;
}

export interface ParsedSettings {
  settings: PortfolioSettings;
  /** Claves con valor inválido (se usó el valor por defecto). */
  invalid: SettingKey[];
}

const positiveInt = (raw: string | undefined, max: number): number | null => {
  if (raw === undefined) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

/** Convierte los valores crudos de `settings` en parámetros válidos (los inválidos → por defecto). */
export function parsePortfolioSettings(raw: Partial<Record<SettingKey, string>>): ParsedSettings {
  const invalid: SettingKey[] = [];
  const int = (key: SettingKey, max: number): number => {
    const value = positiveInt(raw[key], max);
    if (value === null) {
      if (raw[key] !== undefined) invalid.push(key);
      return Number(SETTING_DEFAULTS[key].value);
    }
    return value;
  };
  const cycleWeeks = int('ROTATION_CYCLE_WEEKS', 12);
  const weeklyQuota = int('WEEKLY_CONTACT_QUOTA', 500);
  const maxCyclesWithoutProgress = int('MAX_CYCLES_WITHOUT_PROGRESS', 50);
  let timezone = raw.TIMEZONE?.trim() || SETTING_DEFAULTS.TIMEZONE.value;
  if (!isValidTimeZone(timezone)) {
    invalid.push('TIMEZONE');
    timezone = SETTING_DEFAULTS.TIMEZONE.value;
  }
  return {
    settings: {
      cycleWeeks,
      weeklyQuota,
      maxCyclesWithoutProgress,
      timezone,
      portfolioSize: cycleWeeks * weeklyQuota,
    },
    invalid,
  };
}

export const DEFAULT_PORTFOLIO_SETTINGS: PortfolioSettings = parsePortfolioSettings({}).settings;
