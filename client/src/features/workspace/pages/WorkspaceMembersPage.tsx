import axios from "axios";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { Button, FormField, Input } from "@/components/ui";
import { useAuthStore } from "@/store";

import {
  useWorkspace,
  useWorkspaceMembers,
  useWorkspacePermissions,
  useAddWorkspaceMember,
  useUpdateWorkspaceMemberRole,
  useRemoveWorkspaceMember,
} from "../hooks";
import type { WorkspaceRole } from "../types";

export default function WorkspaceMembersPage(): React.JSX.Element {
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);

  const { data: workspace, isLoading: isWorkspaceLoading } = useWorkspace(workspaceId);
  const {
    data: members = [],
    isLoading: isMembersLoading,
    isError,
  } = useWorkspaceMembers(workspaceId);

  const permissions = useWorkspacePermissions(workspace?.role);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("EDITOR");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addMemberMutation = useAddWorkspaceMember(workspaceId);
  const updateRoleMutation = useUpdateWorkspaceMemberRole(workspaceId);
  const removeMemberMutation = useRemoveWorkspaceMember(workspaceId);

  const handleAddMember = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setErrorMessage(null);
    addMemberMutation.mutate(
      { email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: () => {
          setInviteEmail("");
          setInviteRole("EDITOR");
          setIsInviteOpen(false);
        },
        onError: (err) => {
          if (axios.isAxiosError(err)) {
            setErrorMessage(
              err.response?.data?.message || "Failed to add member."
            );
          } else {
            setErrorMessage("Failed to add member.");
          }
        },
      }
    );
  };

  const handleRoleChange = (
    memberUserId: string,
    newRole: WorkspaceRole
  ): void => {
    if (newRole === "OWNER") return;
    setErrorMessage(null);
    updateRoleMutation.mutate(
      {
        memberUserId,
        payload: { role: newRole },
      },
      {
        onError: (err) => {
          if (axios.isAxiosError(err)) {
            setErrorMessage(
              err.response?.data?.message || "Failed to update member role."
            );
          }
        },
      }
    );
  };

  const handleRemoveMember = (memberUserId: string, isSelf: boolean): void => {
    const confirmMessage = isSelf
      ? "Are you sure you want to leave this workspace?"
      : "Are you sure you want to remove this member?";

    if (!window.confirm(confirmMessage)) return;

    setErrorMessage(null);
    removeMemberMutation.mutate(memberUserId, {
      onSuccess: () => {
        if (isSelf) {
          navigate("/workspaces");
        }
      },
      onError: (err) => {
        if (axios.isAxiosError(err)) {
          setErrorMessage(
            err.response?.data?.message || "Failed to remove member."
          );
        }
      },
    });
  };

  if (isWorkspaceLoading || isMembersLoading) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Loading members...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          Failed to load workspace members.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Workspace Members
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage who has access to this workspace and their permission levels.
          </p>
        </div>

        {permissions.canManageMembers && (
          <Button
            type="button"
            onClick={() => setIsInviteOpen(!isInviteOpen)}
            className="w-auto px-4 py-2"
          >
            {isInviteOpen ? "Cancel" : "Add Member"}
          </Button>
        )}
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {errorMessage}
        </div>
      )}

      {/* Invite Member Drawer/Card */}
      {isInviteOpen && permissions.canManageMembers && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Add New Member
          </h3>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <FormField label="User Email" htmlFor="inviteEmail">
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </FormField>
              </div>

              <div>
                <label
                  htmlFor="inviteRole"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Role
                </label>
                <select
                  id="inviteRole"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(
                      e.target.value as "ADMIN" | "EDITOR" | "VIEWER"
                    )
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                >
                  <option value="EDITOR">Editor (Can create & edit boards)</option>
                  <option value="ADMIN">Admin (Can manage workspace & members)</option>
                  <option value="VIEWER">Viewer (Read-only access)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="w-auto bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addMemberMutation.isPending}
                className="w-auto"
              >
                {addMemberMutation.isPending ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Members List Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Member
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Role
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Joined
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {members.map((member) => {
              const isCurrentUser =
                Boolean(currentUser && (member.userId === currentUser.id || member.user?.email === currentUser.email));
              const isOwner = member.role === "OWNER";
              const canModifyThisMember =
                permissions.canManageMembers && !isOwner;

              return (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                        {member.user?.fullName
                          ? member.user.fullName.charAt(0).toUpperCase()
                          : "U"}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {member.user?.fullName || "User"}
                          {isCurrentUser && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">
                          {member.user?.email || "No email available"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {canModifyThisMember && !isCurrentUser ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(
                            member.userId,
                            e.target.value as WorkspaceRole
                          )
                        }
                        disabled={updateRoleMutation.isPending}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-gray-900 focus:outline-none"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="EDITOR">EDITOR</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          member.role === "OWNER"
                            ? "bg-amber-100 text-amber-800"
                            : member.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : member.role === "EDITOR"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {member.role}
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {isCurrentUser && !isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.userId, true)}
                        className="text-red-600 hover:text-red-900 text-xs font-medium"
                      >
                        Leave Workspace
                      </button>
                    )}

                    {!isCurrentUser && canModifyThisMember && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.userId, false)}
                        disabled={removeMemberMutation.isPending}
                        className="text-red-600 hover:text-red-900 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}