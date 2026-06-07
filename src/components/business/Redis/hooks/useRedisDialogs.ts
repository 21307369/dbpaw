import { useState } from "react";

export function useRedisDialogs() {
  const [mgetDialogOpen, setMgetDialogOpen] = useState(false);
  const [msetData, setMsetData] = useState("");

  const [msetDialogOpen, setMsetDialogOpen] = useState(false);
  const [msetImportText, setMsetImportText] = useState("");
  const [msetLoading, setMsetLoading] = useState(false);

  const [expireDialogOpen, setExpireDialogOpen] = useState(false);
  const [expireTtl, setExpireTtl] = useState("");

  const openExpireDialog = () => setExpireDialogOpen(true);
  const closeExpireDialog = () => {
    setExpireDialogOpen(false);
    setExpireTtl("");
  };

  const openMgetDialog = (data: string) => {
    setMsetData(data);
    setMgetDialogOpen(true);
  };
  const closeMgetDialog = () => {
    setMgetDialogOpen(false);
    setMsetData("");
  };

  const openMsetDialog = () => setMsetDialogOpen(true);
  const closeMsetDialog = () => {
    setMsetDialogOpen(false);
    setMsetImportText("");
  };

  return {
    mgetDialogOpen,
    msetData,
    setMgetDialogOpen,
    openMgetDialog,
    closeMgetDialog,
    msetDialogOpen,
    msetImportText,
    msetLoading,
    setMsetDialogOpen,
    setMsetImportText,
    setMsetLoading,
    openMsetDialog,
    closeMsetDialog,
    expireDialogOpen,
    expireTtl,
    setExpireDialogOpen,
    setExpireTtl,
    openExpireDialog,
    closeExpireDialog,
  };
}
