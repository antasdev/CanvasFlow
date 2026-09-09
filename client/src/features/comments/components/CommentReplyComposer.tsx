import React from "react";

import type { CommentMention } from "../types";
import CommentComposer from "./CommentComposer";

type CommentReplyComposerProps = {
  parentCommentId: string;
  shapeId?: string | null;
  workspaceId?: string;
  boardId?: string;
  onSubmit: (content: string, mentions?: CommentMention[]) => Promise<boolean | void>;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export default function CommentReplyComposer({
  shapeId,
  workspaceId,
  boardId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CommentReplyComposerProps): React.JSX.Element {
  return (
    <div className="mt-2 pl-4 border-l-2 border-blue-200">
      <CommentComposer
        placeholder="Reply to this thread... (type @ to mention)"
        shapeId={shapeId}
        workspaceId={workspaceId}
        boardId={boardId}
        onSubmit={onSubmit}
        onCancel={onCancel}
        autoFocus
        isSubmitting={isSubmitting}
        className="bg-slate-50 border-slate-200"
      />
    </div>
  );
}
