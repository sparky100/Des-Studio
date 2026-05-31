export const USER_SETTINGS_SCHEMA_VERSION = 1;

export type ThemeId = "system" | "dark" | "light" | "high-contrast-dark";

export interface UiSettings {
  theme?: ThemeId;
}

export const USER_SETTINGS_NAMESPACES = ["ui", "execute", "ai"] as const;

export type UserSettingsNamespace = (typeof USER_SETTINGS_NAMESPACES)[number];

export type UserSettingsJson = Record<UserSettingsNamespace, Record<string, unknown>> & {
  [key: string]: unknown;
};

export interface UserSettingsRecord {
  user_id: string;
  schema_version: number;
  settings_json: UserSettingsJson;
  created_at?: string;
  updated_at?: string;
}

export interface NormalizedUserSettings {
  schemaVersion: number;
  settings: UserSettingsJson;
}
