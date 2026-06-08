import { mock } from "bun:test";

const mockT = (s: string) => s;

const scanKeysMock = mock(() =>
  Promise.resolve({ cursor: "0", keys: [], isPartial: false }),
);
const listDatabasesMock = mock(() =>
  Promise.resolve([{ name: "db0" }, { name: "db1" }]),
);

mock.module("@/services/api", () => ({
  api: {
    redis: {
      scanKeys: scanKeysMock,
      listDatabases: listDatabasesMock,
      batchKeyOps: mock(() => Promise.resolve([])),
      mget: mock(() => Promise.resolve([])),
      mset: mock(() => Promise.resolve({ success: true, affected: 0 })),
    },
  },
}));

mock.module("@/lib/errors", () => ({
  handleApiError: mock(),
}));

mock.module("sonner", () => ({
  toast: { success: mock(), error: mock() },
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

mock.module("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

const keySearchPanelCalls: any[] = [];
const keyListPanelCalls: any[] = [];
const batchToolbarCalls: any[] = [];
const detailPanelCalls: any[] = [];

mock.module("./redis-browser/KeySearchPanel", () => ({
  KeySearchPanel: (props: any) => {
    keySearchPanelCalls.push(props);
    return (
      <div>
        <input
          value={props.pattern}
          onChange={(e: any) => props.onPatternChange(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === "Enter") props.onSearch();
          }}
        />
        <span>{props.keyCount}</span>
        <span>{props.selectedCount}</span>
      </div>
    );
  },
}));

mock.module("./redis-browser/KeyListPanel", () => ({
  KeyListPanel: (props: any) => {
    keyListPanelCalls.push(props);
    return (
      <div>
        {props.requiresPattern && <span>cluster-pattern-required</span>}
        {props.keys.length === 0 && !props.isLoading && !props.requiresPattern && (
          <span>no-keys</span>
        )}
        {props.keys.map((k: any, i: number) => (
          <div key={k.key} onClick={(e: any) => props.onSelectKey(k.key, i, e)}>
            {k.key}
          </div>
        ))}
      </div>
    );
  },
}));

mock.module("./redis-browser/BatchOperationsToolbar", () => ({
  BatchOperationsToolbar: (props: any) => {
    batchToolbarCalls.push(props);
    return <div>batch-toolbar:{props.selectedCount}</div>;
  },
}));

mock.module("./redis-browser/DetailPanel", () => ({
  DetailPanel: (props: any) => {
    detailPanelCalls.push(props);
    return (
      <div>
        detail:{props.detail.mode}
        {props.detail.mode === "view" && `:${props.detail.key}`}
      </div>
    );
  },
}));

mock.module("./redis-browser/RedisBrowserDialogs", () => ({
  RedisBrowserDialogs: () => <div />,
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RedisBrowserView } from "./RedisBrowserView";

describe("RedisBrowserView", () => {
  beforeEach(() => {
    scanKeysMock.mockClear();
    listDatabasesMock.mockClear();
    keySearchPanelCalls.length = 0;
    keyListPanelCalls.length = 0;
    batchToolbarCalls.length = 0;
    detailPanelCalls.length = 0;
    listDatabasesMock.mockResolvedValue([{ name: "db0" }, { name: "db1" }]);
    scanKeysMock.mockResolvedValue({ cursor: "0", keys: [], isPartial: false });
  });

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  test("renders all panels", async () => {
    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).toContain("no-keys");
    expect(container.textContent).toContain("detail:none");
  });

  test("renders keys after scan", async () => {
    scanKeysMock.mockResolvedValue({
      cursor: "0",
      keys: [
        { key: "alpha", keyType: "string", ttl: -1 },
        { key: "beta", keyType: "hash", ttl: 3600 },
      ],
      isPartial: false,
    });

    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("beta");
  });

  test("cluster mode shows pattern required message", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }]);

    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).toContain("cluster-pattern-required");
  });

  test("no batch toolbar when nothing selected", async () => {
    scanKeysMock.mockResolvedValue({
      cursor: "0",
      keys: [{ key: "k1", keyType: "string", ttl: -1 }],
      isPartial: false,
    });

    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).not.toContain("batch-toolbar");
  });

  test("clicking a key opens detail view", async () => {
    scanKeysMock.mockResolvedValue({
      cursor: "0",
      keys: [{ key: "mykey", keyType: "string", ttl: -1 }],
      isPartial: false,
    });

    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).toContain("detail:none");

    // Use the listPanel props to simulate a key click
    const listProps = keyListPanelCalls[keyListPanelCalls.length - 1];
    act(() => listProps.onSelectKey("mykey", 0, { shiftKey: false }));
    await flush();

    expect(container.textContent).toContain("detail:view");
    expect(container.textContent).toContain("mykey");
  });

  test("selectAll shows batch toolbar", async () => {
    scanKeysMock.mockResolvedValue({
      cursor: "0",
      keys: [
        { key: "a", keyType: "string", ttl: -1 },
        { key: "b", keyType: "string", ttl: -1 },
      ],
      isPartial: false,
    });

    const { container } = render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    expect(container.textContent).not.toContain("batch-toolbar");

    const searchProps = keySearchPanelCalls[keySearchPanelCalls.length - 1];
    act(() => searchProps.onSelectAll());
    await flush();

    expect(container.textContent).toContain("batch-toolbar");
    expect(container.textContent).toContain("2");
  });

  test("search triggers scan with pattern", async () => {
    render(<RedisBrowserView connectionId={1} database="0" />);
    await flush();

    // Change pattern through the search panel props
    const searchProps = keySearchPanelCalls[keySearchPanelCalls.length - 1];
    act(() => searchProps.onPatternChange("user:*"));
    await flush();

    // After pattern change, the component re-renders with new props.
    // Get the LATEST onSearch from the most recent call.
    const latestProps = keySearchPanelCalls[keySearchPanelCalls.length - 1];
    act(() => latestProps.onSearch());
    await flush();

    expect(scanKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: "user:*", cursor: "0" }),
    );
  });
});
