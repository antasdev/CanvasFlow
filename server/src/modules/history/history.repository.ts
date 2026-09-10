import { ClientSession, Types } from "mongoose";
import { BoardVersionModel } from "./history.model";
import {
  BoardVersion,
  BoardVersionDocument,
  CreateVersionData,
  UpdateVersionMetadataData,
  VersionFilter,
} from "./history.types";

export class HistoryRepository {
  /**
   * Persists a new BoardVersion document.
   * Uses atomic retry logic to handle concurrent version creation collisions gracefully.
   */
  async create(
    data: CreateVersionData,
    session?: ClientSession
  ): Promise<BoardVersionDocument> {
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        let versionNumber = data.versionNumber;
        if (!versionNumber || versionNumber < 1) {
          const highest = await this.findHighestVersionNumber(
            data.boardId,
            session
          );
          versionNumber = highest + 1;
        }

        const [created] = await BoardVersionModel.create(
          [
            {
              ...data,
              versionNumber,
            },
          ],
          { session }
        );

        return created;
      } catch (error: any) {
        const isDuplicateKeyError =
          error?.code === 11000 ||
          error?.message?.includes("E11000 duplicate key error") ||
          error?.message?.includes("boardId_1_versionNumber_-1");

        if (isDuplicateKeyError && attempt < maxRetries) {
          // Jittered backoff before retrying with freshly queried version number
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 25 + 10)
          );
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      "Failed to allocate unique version number after multiple attempts."
    );
  }

  /**
   * Retrieves a version by its unique ID.
   */
  async findById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<BoardVersionDocument | null> {
    return BoardVersionModel.findById(id, null, { session });
  }

  /**
   * Retrieves a specific version by board ID and version number.
   */
  async findByBoardAndVersionNumber(
    boardId: Types.ObjectId,
    versionNumber: number,
    session?: ClientSession
  ): Promise<BoardVersionDocument | null> {
    return BoardVersionModel.findOne(
      { boardId, versionNumber },
      null,
      { session }
    );
  }

  /**
   * Retrieves the highest version number currently recorded on a board.
   * Returns 0 if no versions exist yet.
   */
  async findHighestVersionNumber(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    const latest = await BoardVersionModel.findOne(
      { boardId },
      { versionNumber: 1 },
      { session }
    ).sort({ versionNumber: -1 });

    return latest?.versionNumber ?? 0;
  }

  /**
   * Retrieves the latest version document for a board.
   */
  async findLatestByBoard(
    boardId: Types.ObjectId,
    session?: ClientSession
  ): Promise<BoardVersionDocument | null> {
    return BoardVersionModel.findOne(
      { boardId },
      null,
      { session }
    ).sort({ versionNumber: -1 });
  }

  /**
   * Retrieves paginated versions for a board, sorted by versionNumber descending.
   */
  async listByBoard(
    boardId: Types.ObjectId,
    filter: VersionFilter = {},
    session?: ClientSession
  ): Promise<{ versions: BoardVersionDocument[]; totalCount: number }> {
    const query: Record<string, unknown> = { boardId };

    if (filter.trigger) {
      query.trigger = filter.trigger;
    }

    if (filter.isNamed !== undefined) {
      query.isNamed = filter.isNamed;
    }

    if (filter.cursor !== undefined && filter.cursor > 0) {
      query.versionNumber = { $lt: filter.cursor };
    }

    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);

    const [versions, totalCount] = await Promise.all([
      BoardVersionModel.find(
        query,
        { "snapshot.canvases.shapes": 0 },
        { session }
      )
        .sort({ versionNumber: -1 })
        .limit(limit + 1), // fetch limit + 1 to detect hasMore
      BoardVersionModel.countDocuments({ boardId }),
    ]);

    return { versions, totalCount };
  }

  /**
   * Updates version metadata (name, description, isNamed).
   * Enforces strict snapshot immutability: will NEVER modify snapshot data.
   */
  async updateMetadata(
    versionId: Types.ObjectId,
    boardId: Types.ObjectId,
    updateData: UpdateVersionMetadataData,
    session?: ClientSession
  ): Promise<BoardVersionDocument | null> {
    const safeUpdates: Record<string, unknown> = {};

    if (updateData.name !== undefined) {
      safeUpdates.name = updateData.name;
    }

    if (updateData.description !== undefined) {
      safeUpdates.description = updateData.description;
    }

    if (updateData.isNamed !== undefined) {
      safeUpdates.isNamed = updateData.isNamed;
    }

    return BoardVersionModel.findOneAndUpdate(
      {
        _id: versionId,
        boardId,
      },
      {
        $set: safeUpdates,
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
      }
    );
  }

  /**
   * Counts versions matching filter for a board.
   */
  async countByBoard(
    boardId: Types.ObjectId,
    filter: VersionFilter = {},
    session?: ClientSession
  ): Promise<number> {
    const query: Record<string, unknown> = { boardId };

    if (filter.trigger) {
      query.trigger = filter.trigger;
    }

    if (filter.isNamed !== undefined) {
      query.isNamed = filter.isNamed;
    }

    return BoardVersionModel.countDocuments(query, { session });
  }
}

export const historyRepository = new HistoryRepository();
