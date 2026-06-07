import { useState } from "react";

export function useRedisDialogs() {
  // MGET dialog state
  const [mgetDialogOpen, setMgetDialogOpen] = useState(false);
  const [msetData, setMsetData] = useState("");

  // MSET dialog state
  const [msetDialogOpen, setMsetDialogOpen] = useState(false);
  const [msetImportText, setMsetImportText] = useState("");

  // EXPIRE dialog state
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
    // MGET
    mgetDialogOpen,
    msetData,
    setMgetDialogOpen,
    openMgetDialog,
    closeMgetDialog,
    // MSET
    msetDialogOpen,
    msetImportText,
    setMsetDialogOpen,
    setMsetImportText,
    openMsetDialog,
    closeMsetDialog,
    // EXPIRE
    expireDialogOpen,
    expireTtl,
    setExpireDialogOpen,
    setExpireTtl,
    openExpireDialog,
    closeExpireDialog,
  };
}
