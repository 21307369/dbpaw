import { AIProviderConfig, AIConversation, AIConversationDetail } from "../api";

const mockAiProviders: AIProviderConfig[] = [
  {
    id: 1,
    name: "OpenAI",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    hasApiKey: true,
    isDefault: false,
    enabled: true,
    extraJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "OpenAI Compat",
    providerType: "openai_compat",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:14b",
    hasApiKey: true,
    isDefault: true,
    enabled: true,
    extraJson: JSON.stringify({ note: "mock provider" }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: "Disabled Provider",
    providerType: "openai",
    baseUrl: "https://example.invalid/v1",
    model: "gpt-4.1",
    hasApiKey: true,
    isDefault: false,
    enabled: false,
    extraJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockAiConversations: AIConversation[] = [
  {
    id: 1,
    title: "Generate: Order List SQL",
    scenario: "sql_generate",
    connectionId: 1,
    database: "testdb",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 2,
    title: "Optimize: Slow Query Log",
    scenario: "sql_optimize",
    connectionId: 1,
    database: "testdb",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    title: "Explain: JOIN Statement",
    scenario: "sql_explain",
    connectionId: 1,
    database: "testdb",
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 4,
    title: "Test: Markdown Rendering",
    scenario: "general_chat",
    connectionId: 1,
    database: "testdb",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockAiMessages: Record<number, AIConversationDetail["messages"]> = {
  1: [
    {
      id: 1,
      conversationId: 1,
      role: "user",
      content:
        "List order count and total amount for each user in the last 7 days, ordered by total amount descending.",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 2,
      conversationId: 1,
      role: "assistant",
      content:
        "SELECT u.id,\n       u.username,\n       COUNT(o.id) AS order_count,\n       COALESCE(SUM(o.total_amount), 0) AS total_amount\nFROM public.users u\nLEFT JOIN public.orders o\n  ON o.user_id = u.id\n AND o.created_at >= NOW() - INTERVAL '7 days'\nGROUP BY u.id, u.username\nORDER BY total_amount DESC;",
      model: "mock-model",
      createdAt: new Date(Date.now() - 86400000 + 1000).toISOString(),
    },
  ],
  2: [
    {
      id: 3,
      conversationId: 2,
      role: "user",
      content:
        "Optimize this query: SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '30 days' AND action = 'login'",
      createdAt: new Date().toISOString(),
    },
    {
      id: 4,
      conversationId: 2,
      role: "assistant",
      content:
        "SELECT id, user_id, action, created_at, ip\nFROM public.audit_logs\nWHERE action = 'login'\n  AND created_at > NOW() - INTERVAL '30 days'\nORDER BY created_at DESC;",
      model: "mock-model",
      createdAt: new Date(Date.now() + 2000).toISOString(),
    },
  ],
  3: [
    {
      id: 5,
      conversationId: 3,
      role: "user",
      content:
        "Explain what this SQL does: SELECT p.id, p.title FROM posts p JOIN users u ON u.id = p.user_id WHERE u.email LIKE '%@example.com' ORDER BY p.id DESC LIMIT 20",
      createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: 6,
      conversationId: 3,
      role: "assistant",
      content:
        "The intent of this SQL is:\n1) Select posts (p.id, p.title) from posts table.\n2) Join users table via p.user_id = u.id, filtering author emails ending with @example.com.\n3) Sort results by post id descending, taking the latest 20.\n\nIf posts table is large, ensure indexes on posts(user_id) and users(email) (or use appropriate pattern matching strategy).",
      model: "mock-model",
      createdAt: new Date(Date.now() - 3 * 3600 * 1000 + 1000).toISOString(),
    },
  ],
  4: [
    {
      id: 7,
      conversationId: 4,
      role: "user",
      content:
        "Please show various Markdown formats, including code blocks, blockquotes, emphasis, etc.",
      createdAt: new Date().toISOString(),
    },
    {
      id: 8,
      conversationId: 4,
      role: "assistant",
      content:
        "Okay, here is a showcase of various Markdown formats:\\n\\n### 1. Code Blocks\\n\\n**SQL Query:**\\n```sql\\nSELECT u.id,\\n       u.username,\\n       COUNT(o.id) AS order_count,\\n       COALESCE(SUM(o.total_amount), 0) AS total_amount\\nFROM public.users u\\nLEFT JOIN public.orders o\\n  ON o.user_id = u.id\\n AND o.created_at >= NOW() - INTERVAL '7 days'\\nGROUP BY u.id, u.username\\nORDER BY total_amount DESC;\\n```\\n\\n**JavaScript:**\\n```javascript\\nfunction hello(name) {\\n  console.log('Hello, World!');\\n}\\n```\\n\\n### 2. Blockquotes\\n\\n> This is a blockquote.\\n> It can contain multiple lines.\\n>\\n> > It can even be nested.\\n\\n### 3. Emphasis\\n\\n*   **Bold Text**\\n*   *Italic Text*\\n*   ***Bold Italic***\\n*   ~~Strikethrough~~\\n\\n### 4. Lists\\n\\n**Unordered List:**\\n- Item A\\n- Item B\\n  - Subitem B.1\\n  - Subitem B.2\\n\\n**Ordered List:**\\n1. Step 1\\n2. Step 2\\n3. Step 3\\n\\n### 5. Tables\\n\\n| Name | Age | Occupation |\\n| :--- | :---: | ---: |\\n| Alice | 25 | Engineer |\\n| Bob | 30 | Designer |\\n| Charlie | 28 | Product Manager |\\n\\n### 6. Links & Inline Code\\n\\nThis is a [link](https://example.com), and this is inline code `const x = 1`.",
      model: "mock-model",
      createdAt: new Date(Date.now() + 1000).toISOString(),
    },
  ],
};

export function handleAi(cmd: string, args?: any): Promise<any> | null {
  switch (cmd) {
    case "ai_list_providers":
      return Promise.resolve([...mockAiProviders]);

    case "ai_create_provider": {
      const requestedType = String(args.config.providerType || "openai");

      const now = new Date().toISOString();
      const isDefault = args.config.isDefault ?? true;
      if (isDefault) {
        mockAiProviders.forEach((p) => (p.isDefault = false));
      }

      const idx = mockAiProviders.findIndex(
        (p) => p.providerType === requestedType,
      );
      if (idx >= 0) {
        mockAiProviders[idx] = {
          ...mockAiProviders[idx],
          ...args.config,
          providerType: requestedType,
          enabled: args.config.enabled ?? true,
          isDefault,
          updatedAt: now,
        };
        return Promise.resolve(mockAiProviders[idx]);
      }

      const id = mockAiProviders.length
        ? Math.max(...mockAiProviders.map((p) => p.id)) + 1
        : 1;
      const created: AIProviderConfig = {
        id,
        providerType: requestedType,
        isDefault,
        enabled: args.config.enabled ?? true,
        extraJson: args.config.extraJson ?? null,
        createdAt: now,
        updatedAt: now,
        ...args.config,
      };
      mockAiProviders.push(created);
      return Promise.resolve(created);
    }

    case "ai_update_provider": {
      const idx = mockAiProviders.findIndex((p) => p.id === args.id);
      if (idx < 0) throw new Error("Provider not found");
      const requestedType = String(
        args.config.providerType || mockAiProviders[idx].providerType,
      );
      const conflict = mockAiProviders.find(
        (p) => p.providerType === requestedType && p.id !== args.id,
      );
      if (conflict) {
        throw new Error("UNIQUE constraint failed: ai_providers.provider_type");
      }
      if (args.config.isDefault) {
        mockAiProviders.forEach((p) => (p.isDefault = false));
      }
      mockAiProviders[idx] = {
        ...mockAiProviders[idx],
        ...args.config,
        providerType: requestedType,
        updatedAt: new Date().toISOString(),
      };
      return Promise.resolve(mockAiProviders[idx]);
    }

    case "ai_delete_provider": {
      const idx = mockAiProviders.findIndex((p) => p.id === args.id);
      if (idx >= 0) mockAiProviders.splice(idx, 1);
      return Promise.resolve(undefined);
    }

    case "ai_set_default_provider": {
      mockAiProviders.forEach((p) => (p.isDefault = p.id === args.id));
      return Promise.resolve(undefined);
    }

    case "ai_list_conversations":
      return Promise.resolve([...mockAiConversations]);

    case "ai_get_conversation": {
      const c = mockAiConversations.find((x) => x.id === args.conversationId);
      if (!c) throw new Error("Conversation not found");
      return Promise.resolve({
        conversation: c,
        messages: mockAiMessages[c.id] || [],
      });
    }

    case "ai_delete_conversation": {
      const idx = mockAiConversations.findIndex(
        (x) => x.id === args.conversationId,
      );
      if (idx >= 0) mockAiConversations.splice(idx, 1);
      delete mockAiMessages[args.conversationId];
      return Promise.resolve(undefined);
    }

    case "ai_chat_start":
    case "ai_chat_continue": {
      const input = args.request.input as string;
      const selectedTables =
        (args.request.selectedTables as
          | Array<{ schema: string; name: string }>
          | undefined) || [];
      let conversationId = args.request.conversationId as number | undefined;
      if (!conversationId) {
        conversationId = mockAiConversations.length
          ? Math.max(...mockAiConversations.map((x) => x.id)) + 1
          : 1;
        mockAiConversations.unshift({
          id: conversationId,
          title: args.request.title || input.slice(0, 20),
          scenario: args.request.scenario || "sql_generate",
          connectionId: args.request.connectionId || null,
          database: args.request.database || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      const msgs = mockAiMessages[conversationId] || [];
      const now = new Date().toISOString();
      msgs.push({
        id: msgs.length + 1,
        conversationId,
        role: "user",
        content: input,
        createdAt: now,
      } as any);
      msgs.push({
        id: msgs.length + 1,
        conversationId,
        role: "assistant",
        content: (() => {
          const scenario = String(args.request.scenario || "sql_generate");
          const first = selectedTables[0];
          const from = first ? `${first.schema}.${first.name}` : "public.users";

          if (
            input.toLowerCase().includes("markdown") ||
            input.includes("format")
          ) {
            return "Okay, here is a showcase of various Markdown formats:\n\n### 1. Code Blocks\n\n**SQL Query:**\n```sql\nSELECT u.id,\n       u.username,\n       COUNT(o.id) AS order_count,\n       COALESCE(SUM(o.total_amount), 0) AS total_amount\nFROM public.users u\nLEFT JOIN public.orders o\n  ON o.user_id = u.id\n AND o.created_at >= NOW() - INTERVAL '7 days'\nGROUP BY u.id, u.username\nORDER BY total_amount DESC;\n```\n\n**JavaScript:**\n```javascript\nfunction hello(name) {\n  console.log('Hello, World!');\n}\n```\n\n### 2. Blockquotes\n\n> This is a blockquote.\n> It can contain multiple lines.\n>\n> > It can even be nested.\n\n### 3. Emphasis\n\n*   **Bold Text**\n*   *Italic Text*\n*   ***Bold Italic***\n*   ~~Strikethrough~~\n\n### 4. Lists\n\n**Unordered List:**\n- Item A\n- Item B\n  - Subitem B.1\n  - Subitem B.2\n\n**Ordered List:**\n1. Step 1\n2. Step 2\n3. Step 3\n\n### 5. Tables\n\n| Name | Age | Occupation |\n| :--- | :---: | ---: |\n| Alice | 25 | Engineer |\n| Bob | 30 | Designer |\n| Charlie | 28 | Product Manager |\n\n### 6. Links & Inline Code\n\nThis is a [link](https://example.com), and this is inline code `const x = 1`.";
          }

          if (scenario === "sql_optimize") {
            return `SELECT *\nFROM ${from}\nWHERE 1=1\nLIMIT 100;`;
          }
          if (scenario === "sql_explain") {
            return `This is a mock explanation: The SQL mainly reads data from ${from}.`;
          }
          if (selectedTables.length > 0) {
            const names = selectedTables
              .map((t) => `${t.schema}.${t.name}`)
              .join(", ");
            return `SELECT *\nFROM ${from}\n-- selected tables: ${names}\nLIMIT 50;`;
          }
          return `SELECT *\nFROM ${from}\nLIMIT 50;`;
        })(),
        model: "mock-model",
        createdAt: now,
      } as any);
      mockAiMessages[conversationId] = msgs;
      const idx = mockAiConversations.findIndex((x) => x.id === conversationId);
      if (idx >= 0) {
        mockAiConversations[idx] = {
          ...mockAiConversations[idx],
          updatedAt: now,
        };
      }
      return Promise.resolve({
        conversationId,
        userMessageId: msgs[msgs.length - 2].id,
        assistantMessageId: msgs[msgs.length - 1].id,
      });
    }

    default:
      return null;
  }
}
