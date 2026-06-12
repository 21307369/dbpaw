import { useTranslation } from "react-i18next";
import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { useZSetEditing } from "../hooks/useZSetEditing";

interface ZSetMember {
  member: string;
  score: number;
}

interface ZSetRowsProps {
  members: ZSetMember[];
  editing: ReturnType<typeof useZSetEditing>;
  onZsetIncrBy?: (member: string, amount: number) => void;
  filterActive: boolean;
  lexActive: boolean;
}

export function ZSetRows({
  members,
  editing,
  onZsetIncrBy,
  filterActive,
}: ZSetRowsProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">
              {t("redis.zset.member")}
            </TableHead>
            <TableHead className="w-[140px] text-xs">
              {t("redis.zset.score")}
            </TableHead>
            <TableHead className="w-[48px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {editing.showNewRow && (
            <TableRow className="bg-muted/20">
              <TableCell className="py-1.5">
                <Input
                  className="h-7 font-mono text-xs"
                  value={editing.newMember}
                  onChange={(e) => editing.setNewMember(e.target.value)}
                  placeholder={t("redis.zset.memberPlaceholder")}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") editing.commitAdd();
                    if (e.key === "Escape") editing.cancelAdd();
                  }}
                />
              </TableCell>
              <TableCell className="py-1.5">
                <Input
                  className="h-7 font-mono text-xs"
                  value={editing.newScore}
                  onChange={(e) => {
                    editing.setNewScore(e.target.value);
                    editing.setScoreError(null);
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") editing.commitAdd();
                    if (e.key === "Escape") editing.cancelAdd();
                  }}
                />
                {editing.scoreError && (
                  <p className="mt-1 text-xs text-destructive">
                    {editing.scoreError}
                  </p>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={editing.commitAdd}
                  >
                    <Check className="w-3 h-3 text-green-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={editing.cancelAdd}
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}

          {members.length === 0 && !editing.showNewRow && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground text-sm py-6"
              >
                {filterActive
                  ? t("redis.zset.emptyFiltered")
                  : t("redis.zset.empty")}
              </TableCell>
            </TableRow>
          )}

          {members.map(({ member, score }) => (
            <TableRow key={member} className="group">
              <TableCell
                className="font-mono text-xs py-1.5 truncate max-w-0"
                title={member}
              >
                {member}
              </TableCell>
              <TableCell className="py-1.5">
                {editing.editingMember === member ? (
                  <Input
                    className="h-7 font-mono text-xs"
                    value={editing.editingScore}
                    onChange={(e) => {
                      editing.setEditingScore(e.target.value);
                      editing.setScoreError(null);
                    }}
                    inputMode="decimal"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") editing.commitEdit(member);
                      if (e.key === "Escape") editing.cancelEdit();
                    }}
                  />
                ) : (
                  <span
                    className="font-mono text-xs cursor-pointer hover:text-foreground/70"
                    onClick={() => {
                      editing.setEditingMember(member);
                      editing.setEditingScore(String(score));
                      editing.setScoreError(null);
                    }}
                  >
                    {score}
                  </span>
                )}
                {editing.editingMember === member && editing.scoreError && (
                  <p className="mt-1 text-xs text-destructive">
                    {editing.scoreError}
                  </p>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {editing.editingMember === member ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => editing.commitEdit(member)}
                    >
                      <Check className="w-3 h-3 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={editing.cancelEdit}
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    {onZsetIncrBy && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => onZsetIncrBy(member, -1)}
                          title={t("redis.zset.decreaseScore")}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => onZsetIncrBy(member, 1)}
                          title={t("redis.zset.increaseScore")}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => editing.deleteMember(member)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
