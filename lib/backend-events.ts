export const CORE_BACKEND_EVENTS = Object.freeze({
    TEAM_CREATED: "team.created",
    TEAM_BEFORE_DELETE: "team.before_delete",
    TEAM_DELETED: "team.deleted",
    TEAM_MEMBER_ADDED: "team.member.added",
    TEAM_MEMBER_REMOVED: "team.member.removed",
    PERMISSION_GRANTED: "permission.granted",
    PERMISSION_REVOKED: "permission.revoked",
});

export type BackendEventListener<T> = (event: string, context: T) => void | Promise<void>;

const backendEventListeners: Record<string, BackendEventListener<any>[]> = {};

export function addBackendEventListener<T>(event: string, listener: BackendEventListener<T>) {
    if (!backendEventListeners[event]) {
        backendEventListeners[event] = [];
    }
    backendEventListeners[event].push(listener);
}

export function removeBackendEventListener<T>(event: string, listener: BackendEventListener<T>) {
    if (backendEventListeners[event]) {
        backendEventListeners[event] = backendEventListeners[event].filter(l => l !== listener);
    }
}

export async function emitBackendEvent<T>(event: string, context: T): Promise<void> {
    if (backendEventListeners[event]) {
        for (const listener of backendEventListeners[event]) {
            await listener(event, context);
        }
    }
}
