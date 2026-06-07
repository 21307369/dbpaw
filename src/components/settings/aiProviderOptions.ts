import type { AIProviderPreset } from "./settingsTypes";

export const AI_PROVIDER_OPTIONS: AIProviderPreset[] = [
  {
    type: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    type: "gemini",
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
  {
    type: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-20241022",
  },
  {
    type: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    type: "qwen",
    label: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  {
    type: "kimi",
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
  },
  {
    type: "siliconflow",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-72B-Instruct",
  },
  {
    type: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  {
    type: "glm",
    label: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  {
    type: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
];

export const AI_PROVIDER_OPTIONS_BY_TYPE = AI_PROVIDER_OPTIONS.reduce(
  (acc, item) => ({ ...acc, [item.type]: item }),
  {} as Record<string, AIProviderPreset>,
);
