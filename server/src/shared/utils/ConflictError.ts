import { HttpStatus } from "@/shared/constants";
import { ApiError } from "./ApiError";

export type ConflictResourceType = "shape" | "comment";

/**
 * Dedicated application error representing an optimistic concurrency control (OCC) conflict.
 */
export class ConflictError extends ApiError {
  public readonly resourceType: ConflictResourceType;
  public readonly resourceId: string;
  public readonly currentVersion: number;

  constructor(
    resourceType: ConflictResourceType,
    resourceId: string,
    currentVersion: number,
    message?: string
  ) {
    const defaultMessage = `${
      resourceType === "shape" ? "Shape" : "Comment"
    } has been modified by another collaborator.`;
    super(HttpStatus.CONFLICT, message ?? defaultMessage);

    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.currentVersion = currentVersion;
  }
}
