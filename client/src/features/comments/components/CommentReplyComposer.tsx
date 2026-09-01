import React from "react";

import CommentComposer from "./CommentComposer";

type CommentReplyComposerProps = {
  parentCommentId: string;
  shapeId?: string | null;
  onSubmit: (content: string) => Promise<boolean | void>;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export default function CommentReplyComposer({
  shapeId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CommentReplyComposerProps): React.JSX.Element {
  return (
    <div className="mt-2 pl-4 border-l-2 border-blue-200">
      <CommentComposer
        placeholder="Reply to this thread..."
        shapeId={shapeId}
        onSubmit={onSubmit}
        onCancel={onCancel}
        autoFocus
        isSubmitting={isSubmitting}
        className="bg-slate-50 border-slate-200"
      />
    </div>
  );
}
