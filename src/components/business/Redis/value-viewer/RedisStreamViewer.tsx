import { useEffect } from "react";
import { Info, Loader2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { RedisKeyExtra, RedisStreamEntry } from "@/services/api";
import { useStreamBrowser } from "./stream/hooks/useStreamBrowser";
import { useConsumerGroups } from "./stream/hooks/useConsumerGroups";
import { useXreadgroup } from "./stream/hooks/useXreadgroup";
import { DEFAULT_PAGE_SIZE } from "./stream/utils";
import { StreamFilterBar } from "./stream/StreamFilterBar";
import { StreamSummaryCards } from "./stream/StreamSummaryCards";
import { StreamGroupsTable } from "./stream/StreamGroupsTable";
import { StreamEntriesTable } from "./stream/StreamEntriesTable";
import { StreamAddEntryForm } from "./stream/StreamAddEntryForm";
import {
  CreateGroupDialog,
  ResetGroupDialog,
  TrimDialog,
  ClaimDialog,
} from "./stream/StreamDialogs";

interface Props {
  connectionId: number;
  database: string;
  redisKey: string;
  value: RedisStreamEntry[];
  onChange: (v: RedisStreamEntry[]) => void;
  totalLen?: number | null;
  extra?: RedisKeyExtra | null;
  isCreateMode?: boolean;
}

export function RedisStreamViewer({ connectionId, database, redisKey, value, onChange, totalLen, extra, isCreateMode }: Props) {
  const br = useStreamBrowser({ connectionId, database, redisKey, value, onChange, totalLen, extra, isCreateMode });
  const cg = useConsumerGroups({ connectionId, database, redisKey, refreshView: br.refreshView });
  const xrg = useXreadgroup({ connectionId, database, redisKey, countInput: br.browser.countInput, value });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { br.reset(); cg.reset(); xrg.reset(); }, [connectionId, database, redisKey, totalLen, extra]);

  return (
    <div className="space-y-3">
      {!isCreateMode && (
        <>
          <StreamFilterBar
            browser={br.browser}
            isLoading={br.isLoadingView}
            onChange={br.setBrowser}
            onApply={() => void br.loadStreamView("replace")}
            onReset={() => {
              br.setBrowser((c) => ({ ...c, startIdInput: "", endIdInput: "", countInput: String(DEFAULT_PAGE_SIZE), appliedStartId: "-", appliedEndId: "+", pageSize: DEFAULT_PAGE_SIZE }));
              void br.loadStreamView("replace", { startId: "-", endId: "+", count: DEFAULT_PAGE_SIZE });
            }}
            readMode={xrg.readMode}
            onReadModeChange={xrg.setReadMode}
            xrgGroup={xrg.xrgGroup}
            onXrgGroupChange={xrg.setXrgGroup}
            xrgConsumer={xrg.xrgConsumer}
            onXrgConsumerChange={xrg.setXrgConsumer}
            xrgStartId={xrg.xrgStartId}
            onXrgStartIdChange={xrg.setXrgStartId}
            groups={br.browser.groups}
            onXreadgroupApply={() => void xrg.handleXreadgroup()}
            isLoadingXrg={xrg.isLoadingXrg}
          />
          <StreamSummaryCards
            entryCount={value.length}
            totalLen={br.browser.totalLen}
            streamInfo={br.browser.streamInfo}
            groups={br.browser.groups}
            appliedStartId={br.browser.appliedStartId}
            appliedEndId={br.browser.appliedEndId}
            onTrim={() => cg.setShowTrimDialog(true)}
          />
          <StreamGroupsTable
            groups={br.browser.groups}
            expandedGroupNames={cg.expandedGroupNames}
            pendingData={cg.pendingData}
            pendingLoading={cg.pendingLoading}
            selectedPendingIds={cg.selectedPendingIds}
            onToggleGroup={cg.toggleGroupExpand}
            onCreateGroup={() => cg.setShowCreateGroupDialog(true)}
            onDeleteGroup={(name) => cg.setDeleteGroupTarget(name)}
            onResetGroup={(name) => cg.setResetGroupTarget(name)}
            onLoadPendingDetails={cg.loadPendingDetails}
            onAck={cg.handleAck}
            onClaim={(group, entry) => cg.setClaimTarget({ group, entry })}
            onTogglePendingSelect={cg.onTogglePendingSelect}
          />
        </>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {xrg.readMode === "xreadgroup" && xrg.xrgEntries !== null
            ? `${xrg.xrgEntries.length} entries (consumer group mode)`
            : `${value.length} entries${br.browser.totalLen !== null ? ` / ${br.browser.totalLen}` : ""}`}
        </span>
        <div className="flex gap-2">
          {!isCreateMode && (
            <span className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />Page size {br.browser.pageSize}
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7" onClick={() => br.setShowNewRow(true)} disabled={br.showNewRow}>
            <Plus className="mr-1 h-3 w-3" />Add entry
          </Button>
        </div>
      </div>

      {br.showNewRow && (
        <StreamAddEntryForm
          newId={br.newId}
          newFieldsRaw={br.newFieldsRaw}
          onIdChange={br.setNewId}
          onFieldsChange={br.setNewFieldsRaw}
          onAdd={br.addEntry}
          onCancel={() => { br.setShowNewRow(false); br.setNewId("*"); br.setNewFieldsRaw(""); }}
        />
      )}

      <StreamEntriesTable
        entries={xrg.displayEntries}
        expandedIds={br.expandedIds}
        onToggleExpand={br.toggleExpand}
        onDelete={br.deleteEntry}
        pendingAckIds={xrg.readMode === "xreadgroup" && xrg.xrgEntries !== null ? new Set(xrg.xrgEntries.map((e) => e.id)) : undefined}
        onAckSingle={xrg.readMode === "xreadgroup" && xrg.xrgGroup ? (id) => void cg.handleAck(xrg.xrgGroup, [id]) : undefined}
      />

      {!isCreateMode && br.hasMore && xrg.readMode === "xrange" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing {value.length}{br.browser.totalLen !== null ? ` of ${br.browser.totalLen}` : ""}</span>
          <Button variant="outline" size="sm" onClick={() => void br.loadStreamView("append")} disabled={br.isLoadingView}>
            {br.isLoadingView ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load more
          </Button>
        </div>
      )}

      {cg.showCreateGroupDialog && <CreateGroupDialog onClose={() => cg.setShowCreateGroupDialog(false)} onConfirm={cg.handleCreateGroup} />}

      <AlertDialog open={!!cg.deleteGroupTarget} onOpenChange={(o) => { if (!o) cg.setDeleteGroupTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete consumer group</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the group <span className="font-mono font-semibold">{cg.deleteGroupTarget}</span> and all its pending entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cg.handleDeleteGroup()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {cg.resetGroupTarget && <ResetGroupDialog groupName={cg.resetGroupTarget} onClose={() => cg.setResetGroupTarget(null)} onConfirm={cg.handleResetGroup} />}

      {cg.showTrimDialog && (
        <TrimDialog
          currentLength={br.browser.streamInfo?.length ?? br.browser.totalLen ?? value.length}
          onClose={() => cg.setShowTrimDialog(false)}
          onConfirm={cg.handleTrim}
        />
      )}

      {cg.claimTarget && (
        <ClaimDialog
          entry={cg.claimTarget.entry}
          onClose={() => cg.setClaimTarget(null)}
          onConfirm={(consumer) => void cg.handleClaim(cg.claimTarget!.group, consumer, cg.claimTarget!.entry.id)}
        />
      )}
    </div>
  );
}
