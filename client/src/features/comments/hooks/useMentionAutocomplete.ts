import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";

import { useBoard } from "@/features/board/hooks";
import { workspaceApi } from "@/features/workspace/api";
import type { WorkspaceMember } from "@/features/workspace/types";

import type { CommentMention } from "../types";

export type UseMentionAutocompleteProps = {
  content: string;
  onChangeContent: (content: string) => void;
  workspaceId?: string;
  boardId?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  initialMentions?: CommentMention[];
  onMentionsChange?: (mentions: CommentMention[]) => void;
};

export type UseMentionAutocompleteReturn = {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  matchingMembers: WorkspaceMember[];
  isLoading: boolean;
  mentions: CommentMention[];
  selectMember: (member: WorkspaceMember) => void;
  closeAutocomplete: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  setMentions: React.Dispatch<React.SetStateAction<CommentMention[]>>;
};

/**
 * Reconciles tracked mention ranges against current content.
 * Keeps valid mentions whose range slice strictly matches `@${displayName}`.
 */
export function reconcileMentions(
  content: string,
  existingMentions: CommentMention[]
): CommentMention[] {
  if (!existingMentions || existingMentions.length === 0) return [];

  return existingMentions.filter((m) => {
    if (
      typeof m.startIndex !== "number" ||
      typeof m.endIndex !== "number" ||
      m.startIndex < 0 ||
      m.endIndex <= m.startIndex ||
      m.endIndex > content.length
    ) {
      return false;
    }
    const slice = content.slice(m.startIndex, m.endIndex);
    return slice === `@${m.displayName}`;
  });
}

export function useMentionAutocomplete({
  content,
  onChangeContent,
  workspaceId: propWorkspaceId,
  boardId: propBoardId,
  textareaRef,
  initialMentions = [],
  onMentionsChange,
}: UseMentionAutocompleteProps): UseMentionAutocompleteReturn {
  const routeParams = useParams<{ boardId?: string; workspaceId?: string }>();
  const activeBoardId = propBoardId || routeParams.boardId;
  const { data: boardData } = useBoard(activeBoardId ?? "");

  const effectiveWorkspaceId =
    propWorkspaceId ||
    boardData?.workspaceId?.toString() ||
    routeParams.workspaceId ||
    "";

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [matchingMembers, setMatchingMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mentions, setMentions] = useState<CommentMention[]>(initialMentions);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync mentions upward when changed
  const handleMentionsUpdate = useCallback(
    (newMentions: CommentMention[]) => {
      setMentions(newMentions);
      onMentionsChange?.(newMentions);
    },
    [onMentionsChange]
  );

  // Reconcile mentions on external content edit
  useEffect(() => {
    const reconciled = reconcileMentions(content, mentions);
    if (reconciled.length !== mentions.length) {
      handleMentionsUpdate(reconciled);
    }
  }, [content, mentions, handleMentionsUpdate]);

  // Detect '@' trigger before cursor
  const checkMentionTrigger = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? content.length;
    const textBeforeCursor = content.slice(0, cursorPos);

    // Match '@' preceded by whitespace or at line start, followed by 0-30 query chars
    const match = /(?:^|\s)@([a-zA-Z0-9_\.\s]{0,30})$/.exec(textBeforeCursor);

    if (match) {
      const query = match[1];
      const matchIndex = textBeforeCursor.lastIndexOf("@");
      setTriggerIndex(matchIndex);
      setSearchQuery(query);
      setIsOpen(true);
      setSelectedIndex(0);
    } else {
      setIsOpen(false);
      setSearchQuery("");
      setTriggerIndex(-1);
    }
  }, [content, textareaRef]);

  useEffect(() => {
    checkMentionTrigger();
  }, [content, checkMentionTrigger]);

  // Fetch matching members with debouncing
  useEffect(() => {
    if (!isOpen || !effectiveWorkspaceId) {
      setMatchingMembers([]);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const members = await workspaceApi.getMembers(
          effectiveWorkspaceId,
          searchQuery
        );
        // Filter active members with valid users
        const validMembers = members.filter((m) => Boolean(m.user));
        setMatchingMembers(validMembers);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Failed to fetch workspace members for mention autocomplete:", err);
        setMatchingMembers([]);
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, searchQuery, effectiveWorkspaceId]);

  // Select member and insert token
  const selectMember = useCallback(
    (member: WorkspaceMember) => {
      if (!member.user || triggerIndex < 0) return;

      const textarea = textareaRef.current;
      const currentPos = textarea?.selectionStart ?? triggerIndex + 1 + searchQuery.length;
      const displayName = member.user.fullName || "User";

      const beforeMention = content.slice(0, triggerIndex);
      const afterMention = content.slice(currentPos);

      const mentionText = `@${displayName} `;
      const newContent = `${beforeMention}${mentionText}${afterMention}`;

      const startIndex = triggerIndex;
      const endIndex = triggerIndex + 1 + displayName.length; // slice without trailing space

      const newMention: CommentMention = {
        userId: member.userId,
        displayName,
        startIndex,
        endIndex,
      };

      const lengthDelta = mentionText.length - (currentPos - triggerIndex);

      // Shift remaining mentions that occur after this trigger
      const updatedMentions = mentions
        .filter((m) => m.endIndex <= triggerIndex || m.startIndex >= currentPos)
        .map((m) => {
          if (m.startIndex >= currentPos) {
            return {
              ...m,
              startIndex: m.startIndex + lengthDelta,
              endIndex: m.endIndex + lengthDelta,
            };
          }
          return m;
        });

      updatedMentions.push(newMention);
      // Keep sorted by startIndex
      updatedMentions.sort((a, b) => a.startIndex - b.startIndex);

      onChangeContent(newContent);
      handleMentionsUpdate(updatedMentions);

      setIsOpen(false);
      setSearchQuery("");
      setTriggerIndex(-1);

      // Restore cursor position after the inserted token
      const nextCursorPos = endIndex + 1;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
        }
      }, 0);
    },
    [
      content,
      triggerIndex,
      searchQuery,
      mentions,
      onChangeContent,
      handleMentionsUpdate,
      textareaRef,
    ]
  );

  const closeAutocomplete = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setTriggerIndex(-1);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isOpen) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (matchingMembers.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % matchingMembers.length);
        }
        return true;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (matchingMembers.length > 0) {
          setSelectedIndex(
            (prev) => (prev - 1 + matchingMembers.length) % matchingMembers.length
          );
        }
        return true;
      }

      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
        if (matchingMembers.length > 0 && selectedIndex >= 0 && selectedIndex < matchingMembers.length) {
          e.preventDefault();
          e.stopPropagation();
          selectMember(matchingMembers[selectedIndex]);
          return true;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeAutocomplete();
        return true;
      }

      return false;
    },
    [isOpen, matchingMembers, selectedIndex, selectMember, closeAutocomplete]
  );

  return {
    isOpen,
    searchQuery,
    selectedIndex,
    matchingMembers,
    isLoading,
    mentions,
    selectMember,
    closeAutocomplete,
    handleKeyDown,
    setMentions: handleMentionsUpdate as any,
  };
}
