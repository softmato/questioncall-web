"use client";

export const PERSISTENT_CALL_START_EVENT = "qc:persistent-call:start";

export type PersistentCallStartDetail = {
  callSessionId: string;
};

// The call host is loaded lazily, so a call started before it mounts (e.g.
// /calls/[id] firing on first paint) is kept here for the host to pick up.
let pendingStart: PersistentCallStartDetail | null = null;

export function takePendingPersistentCall() {
  const detail = pendingStart;
  pendingStart = null;
  return detail;
}

export function startPersistentCall(detail: PersistentCallStartDetail) {
  pendingStart = detail;
  window.dispatchEvent(
    new CustomEvent<PersistentCallStartDetail>(PERSISTENT_CALL_START_EVENT, {
      detail,
    }),
  );
}
