import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRedisKeyScan } from "./hooks/useRedisKeyScan";
import { useRedisSelection } from "./hooks/useRedisSelection";
import { useRedisBatchOps } from "./hooks/useRedisBatchOps";
import { useRedisDialogs } from "./hooks/useRedisDialogs";
import { KeySearchPanel } from "./redis-browser/KeySearchPanel";
import { KeyListPanel } from "./redis-browser/KeyListPanel";
import { BatchOperationsToolbar } from "./redis-browser/BatchOperationsToolbar";
import { DetailPanel } from "./redis-browser/DetailPanel";
import { RedisBrowserDialogs } from "./redis-browser/RedisBrowserDialogs";

interface Props {
  connectionId: number;
  database: string;
  onOpenConsole?: () => void;
}

export function RedisBrowserView({
  connectionId,
  database,
  onOpenConsole,
}: Props) {
  const scan = useRedisKeyScan({ connectionId, database });
  const selection = useRedisSelection({
    keys: scan.keys,
    onScanRefresh: () => scan.scan(scan.pattern, "0", false),
  });
  const batchOps = useRedisBatchOps({
    connectionId,
    database,
    selectedKeys: selection.selectedKeys,
    onScanRefresh: () => scan.scan(scan.pattern, "0", false),
    onKeysDeleted: selection.clearSelection,
  });
  const dialogs = useRedisDialogs();

  const handleMgetExport = async () => {
    const data = await batchOps.handleMgetExport();
    if (data) {
      dialogs.openMgetDialog(data);
    }
  };

  const handleMsetSubmit = async () => {
    const success = await batchOps.handleMsetImport(dialogs.msetImportText);
    if (success) {
      dialogs.closeMsetDialog();
    }
  };

  const handleMsetFileImport = async () => {
    const content = await batchOps.handleMsetFileImport();
    if (content) {
      dialogs.setMsetImportText(content);
    }
  };

  const handleExpireSubmit = () => {
    batchOps.runBatchOp("expire", parseInt(dialogs.expireTtl, 10));
    dialogs.closeExpireDialog();
  };

  const handleCheckboxToggle = (key: string, _index: number) => {
    selection.setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={30} minSize={18} maxSize={50}>
        <div className="h-full flex flex-col border-r">
          <KeySearchPanel
            pattern={scan.pattern}
            onPatternChange={scan.setPattern}
            isLoading={scan.isLoading}
            onSearch={() => {
              selection.setDetail({ mode: "none" });
              scan.handleSearch();
            }}
            keyCount={scan.keys.length}
            isPartial={scan.isPartial}
            selectedCount={selection.selectedCount}
            onSelectAll={selection.selectAll}
            onClearSelection={selection.clearSelection}
            onOpenConsole={onOpenConsole}
            onNewKey={selection.handleNewKey}
          />
          {selection.selectedCount > 0 && (
            <BatchOperationsToolbar
              selectedCount={selection.selectedCount}
              batchLoading={batchOps.batchLoading}
              onRunBatchOp={batchOps.runBatchOp}
              onOpenExpireDialog={dialogs.openExpireDialog}
              onMgetExport={handleMgetExport}
              onOpenMsetDialog={dialogs.openMsetDialog}
            />
          )}
          <KeyListPanel
            keys={scan.keys}
            selectedKeys={selection.selectedKeys}
            selectedKey={selection.selectedKey}
            onSelectKey={selection.handleSelectKey}
            onCheckboxToggle={handleCheckboxToggle}
            isLoading={scan.isLoading}
            isPartial={scan.isPartial}
            onLoadMore={scan.handleLoadMore}
            requiresPattern={scan.requiresPattern}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={70} minSize={50}>
        <DetailPanel
          detail={selection.detail}
          connectionId={connectionId}
          database={database}
          onNewKey={selection.handleNewKey}
          onKeyDeleted={selection.handleKeyDeleted}
          onKeySaved={selection.handleKeySaved}
        />
      </ResizablePanel>

      <RedisBrowserDialogs
        expireDialogOpen={dialogs.expireDialogOpen}
        expireTtl={dialogs.expireTtl}
        onExpireDialogOpenChange={dialogs.setExpireDialogOpen}
        onExpireTtlChange={dialogs.setExpireTtl}
        onExpireSubmit={handleExpireSubmit}
        mgetDialogOpen={dialogs.mgetDialogOpen}
        mgetData={dialogs.msetData}
        onMgetDialogOpenChange={dialogs.setMgetDialogOpen}
        msetDialogOpen={dialogs.msetDialogOpen}
        msetImportText={dialogs.msetImportText}
        msetLoading={batchOps.batchLoading}
        onMsetDialogOpenChange={dialogs.setMsetDialogOpen}
        onMsetImportTextChange={dialogs.setMsetImportText}
        onMsetSubmit={handleMsetSubmit}
        onMsetFileImport={handleMsetFileImport}
        selectedCount={selection.selectedCount}
        batchLoading={batchOps.batchLoading}
      />
    </ResizablePanelGroup>
  );
}
