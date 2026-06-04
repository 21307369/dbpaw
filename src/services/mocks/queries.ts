import { SavedQuery } from "../api";

export const mockSavedQueries: SavedQuery[] = [
  {
    id: 1,
    name: "Get all users",
    query: "SELECT * FROM users",
    description: "Fetch all users from the database",
    connectionId: 1,
    database: "testdb",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Active posts",
    query: "SELECT * FROM posts WHERE status = 'active'",
    description: null,
    connectionId: 1,
    database: "testdb",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function mockGetSavedQueries(): Promise<SavedQuery[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...mockSavedQueries];
}

export async function mockSaveQuery(data: {
  name: string;
  query: string;
  description?: string;
  connectionId?: number;
  database?: string;
}): Promise<SavedQuery> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const newQuery: SavedQuery = {
    id:
      mockSavedQueries.length > 0
        ? Math.max(...mockSavedQueries.map((q) => q.id)) + 1
        : 1,
    name: data.name,
    query: data.query,
    description: data.description || null,
    connectionId: data.connectionId || null,
    database: data.database || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockSavedQueries.push(newQuery);
  return newQuery;
}

export async function mockUpdateSavedQuery(
  id: number,
  data: {
    name: string;
    query: string;
    description?: string;
    connectionId?: number;
    database?: string;
  },
): Promise<SavedQuery> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const index = mockSavedQueries.findIndex((q) => q.id === id);
  if (index === -1) {
    throw new Error(`Saved query with id ${id} not found`);
  }

  const updatedQuery = {
    ...mockSavedQueries[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  mockSavedQueries[index] = updatedQuery;
  return updatedQuery;
}

export async function mockDeleteSavedQuery(id: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const index = mockSavedQueries.findIndex((q) => q.id === id);
  if (index !== -1) {
    mockSavedQueries.splice(index, 1);
  }
}

export function handleQueries(cmd: string, args?: any): Promise<any> | null {
  switch (cmd) {
    case "get_saved_queries":
      return mockGetSavedQueries();
    case "save_query":
      return mockSaveQuery(args);
    case "update_saved_query":
      return mockUpdateSavedQuery(args.id, args);
    case "delete_saved_query":
      return mockDeleteSavedQuery(args.id);
    default:
      return null;
  }
}
