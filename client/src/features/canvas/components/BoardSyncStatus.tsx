import { CheckCircle2, CloudUpload, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import React, { useEffect, useState, useMemo } from "react";

import { socketClientService } from "@/services/socket";

import { useCollaborationStore } from "../store/collaboration.store";
import { useMutationStore } from "../store/mutation.store";

/**
 * Authoritative cloud sync indicator reflecting real socket connectivity,
 * in-flight mutation journal state, and authoritative recovery status.
 */
export default function BoardSyncStatus(): React.JSX.Element {
  const [isConnected, setIsConnected] = useState<boolean>(() => {
    const s = socketClientService.getSocket();
    return s?.connected ?? false;
  });

  useEffect(() => {
    const socket = socketClientService.getSocket() ?? socketClientService.connect();

    const handleConnect = (): void => setIsConnected(true);
    const handleDisconnect = (): void => setIsConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  const mutations = useMutationStore((state) => state.mutations);
  const isRecovering = useCollaborationStore((state) => state.isRecovering);
  const lastConflict = useCollaborationStore((state) => state.lastConflict);

  const hasPending = useMemo(() => {
    return Object.values(mutations).some(
      (m) => m.status === "pending" || m.status === "reconciling"
    );
  }, [mutations]);

  if (!isConnected) {
    return (
      <div
        className="flex items-center gap-1 text-[11px] font-medium text-gray-400"
        title="Disconnected from server. Reconnecting..."
        role="status"
        aria-live="polite"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Offline</span>
      </div>
    );
  }

  if (isRecovering) {
    return (
      <div
        className="flex items-center gap-1 text-[11px] font-medium text-amber-600"
        title="Syncing authoritative board state..."
        role="status"
        aria-live="polite"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">Syncing...</span>
      </div>
    );
  }

  if (hasPending) {
    return (
      <div
        className="flex items-center gap-1 text-[11px] font-medium text-amber-600"
        title="Saving changes to cloud..."
        role="status"
        aria-live="polite"
      >
        <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
        <span className="hidden sm:inline">Saving...</span>
      </div>
    );
  }

  if (lastConflict) {
    return (
      <div
        className="flex items-center gap-1 text-[11px] font-medium text-rose-500"
        title={lastConflict.message || "Conflict detected"}
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Conflict</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"
      title="All changes saved to cloud"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Saved</span>
    </div>
  );
}
