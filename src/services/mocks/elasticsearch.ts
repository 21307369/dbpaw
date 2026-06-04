export function handleElasticsearch(
  cmd: string,
  args?: any,
): Promise<any> | null {
  switch (cmd) {
    case "elasticsearch_test_connection":
      return Promise.resolve({
        clusterName: "mock-cluster",
        clusterUuid: "mock-uuid",
        version: "8.13.0",
        tagline: "You Know, for Search",
      });

    case "elasticsearch_test_connection_ephemeral":
      return Promise.resolve({
        success: true,
        message: "Connected to Elasticsearch 8.13.0",
        latencyMs: 12,
      });

    case "elasticsearch_list_indices":
      return Promise.resolve([
        {
          name: "products",
          health: "green",
          status: "open",
          uuid: "mock-uuid-1",
          primaryShards: "1",
          replicaShards: "1",
          docsCount: 128,
          storeSize: "45kb",
          isSystem: false,
        },
        {
          name: "orders",
          health: "green",
          status: "open",
          uuid: "mock-uuid-2",
          primaryShards: "1",
          replicaShards: "1",
          docsCount: 512,
          storeSize: "120kb",
          isSystem: false,
        },
        {
          name: ".kibana",
          health: "green",
          status: "open",
          uuid: "mock-uuid-3",
          primaryShards: "1",
          replicaShards: "0",
          docsCount: 8,
          storeSize: "12kb",
          isSystem: true,
        },
      ]);

    case "elasticsearch_get_index_mapping": {
      const idx = String(args.index || "products");
      return Promise.resolve({
        [idx]: {
          mappings: {
            properties: {
              id: { type: "keyword" },
              name: { type: "text" },
              price: { type: "float" },
              category: { type: "keyword" },
              created_at: { type: "date" },
            },
          },
        },
      });
    }

    case "elasticsearch_create_index":
      return Promise.resolve({
        index: String(args.index || "new-index"),
        acknowledged: true,
        shardsAcknowledged: true,
        status: 200,
      });

    case "elasticsearch_delete_index":
      return Promise.resolve({
        index: String(args.index || "products"),
        acknowledged: true,
        shardsAcknowledged: null,
        status: 200,
      });

    case "elasticsearch_refresh_index":
    case "elasticsearch_open_index":
    case "elasticsearch_close_index":
      return Promise.resolve({
        index: String(args.index || "products"),
        acknowledged: true,
        shardsAcknowledged: true,
        status: 200,
      });

    case "elasticsearch_search_documents": {
      const hits = Array.from({ length: 3 }, (_, i) => ({
        index: String(args.index || "products"),
        id: `doc-${i + 1}`,
        score: 1.0 - i * 0.1,
        source: {
          id: `doc-${i + 1}`,
          name: `Mock Product ${i + 1}`,
          price: 19.99 + i * 10,
          category: "electronics",
          created_at: new Date().toISOString(),
        },
        fields: null,
      }));
      return Promise.resolve({
        hits,
        total: 3,
        tookMs: 5,
        aggregations: {
          categories: {
            buckets: [{ key: "electronics", doc_count: 3 }],
          },
        },
      });
    }

    case "elasticsearch_get_document":
      return Promise.resolve({
        index: String(args.index || "products"),
        id: String(args.documentId || "doc-1"),
        found: true,
        source: {
          id: String(args.documentId || "doc-1"),
          name: "Mock Product",
          price: 29.99,
          category: "electronics",
          created_at: new Date().toISOString(),
        },
        fields: null,
      });

    case "elasticsearch_upsert_document":
      return Promise.resolve({
        index: String(args.index || "products"),
        id: args.documentId || `auto-${Date.now()}`,
        result: args.documentId ? "updated" : "created",
        status: args.documentId ? 200 : 201,
      });

    case "elasticsearch_delete_document":
      return Promise.resolve({
        index: String(args.index || "products"),
        id: String(args.documentId || "doc-1"),
        result: "deleted",
        status: 200,
      });

    case "elasticsearch_execute_raw":
      return Promise.resolve({
        status: 200,
        body: '{"count":3,"_shards":{"total":1,"successful":1,"skipped":0,"failed":0}}',
        json: {
          count: 3,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        },
        tookMs: 3,
      });

    default:
      return null;
  }
}
