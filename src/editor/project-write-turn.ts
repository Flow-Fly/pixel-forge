/**
 * Browser-local ownership of one project's mutation turn.
 *
 * Observations do not use this lock. It only records which local actor may
 * start a project mutation, so an automation run cannot race a manual edit or
 * another automation run on the same Project Target.
 */

export type ProjectWriteTurnOwner =
  | {
      readonly kind: 'artist-mode';
      readonly sessionId: string;
      readonly runId: string;
    }
  | {
      readonly kind: 'manual';
      readonly ownerId: string;
    };

export type ProjectWriteTurnResult =
  | { readonly ok: true; readonly owner: ProjectWriteTurnOwner }
  | { readonly ok: false; readonly reason: 'already-held' };

/** One in-memory turn owner per exact Project Target identity. */
export class ProjectWriteTurnStore {
  private readonly owners = new Map<string, ProjectWriteTurnOwner>();

  acquire(targetId: string, owner: ProjectWriteTurnOwner): ProjectWriteTurnResult {
    const current = this.owners.get(targetId);
    if (current) {
      return { ok: false, reason: 'already-held' };
    }
    this.owners.set(targetId, owner);
    return { ok: true, owner };
  }

  release(targetId: string, owner?: ProjectWriteTurnOwner): boolean {
    const current = this.owners.get(targetId);
    if (!current) return false;
    if (owner && !sameOwner(current, owner)) return false;
    this.owners.delete(targetId);
    return true;
  }

  replaceWithManual(targetId: string, ownerId: string): ProjectWriteTurnOwner | undefined {
    const current = this.owners.get(targetId);
    this.owners.set(targetId, { kind: 'manual', ownerId });
    return current;
  }

  owner(targetId: string): ProjectWriteTurnOwner | undefined {
    return this.owners.get(targetId);
  }

  has(targetId: string, owner: ProjectWriteTurnOwner): boolean {
    const current = this.owners.get(targetId);
    return current ? sameOwner(current, owner) : false;
  }
}

function sameOwner(left: ProjectWriteTurnOwner, right: ProjectWriteTurnOwner): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'artist-mode' && right.kind === 'artist-mode') {
    return left.sessionId === right.sessionId && left.runId === right.runId;
  }
  if (left.kind === 'manual' && right.kind === 'manual') {
    return left.ownerId === right.ownerId;
  }
  return false;
}
