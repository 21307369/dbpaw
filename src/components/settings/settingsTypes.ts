import type { AIProviderType } from "@/services/api";

export type SettingsSection =
  | "general"
  | "layout"
  | "ai"
  | "shortcuts"
  | "mcp"
  | "about";

export type SidebarLayout = "tabs" | "tree";

export type AIProviderPreset = {
  type: AIProviderType;
  label: string;
  baseUrl: string;
  model: string;
};
