"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/client";

export type CallStatus = "idle" | "calling" | "connected" | "failed";

interface State {
  status: CallStatus;
  error: string | null;
}

type Action = { type: "START" } | { type: "CONNECTED" } | { type: "FAILED"; message: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "START":
      return { status: "calling", error: null };
    case "CONNECTED":
      return { status: "connected", error: null };
    case "FAILED":
      return { status: "failed", error: action.message };
  }
}

export function useCallHandoff(sessionId: string | null) {
  const [state, dispatch] = useReducer(reducer, { status: "idle", error: null });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async () => {
    if (!sessionId || state.status === "calling") return;
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: "START" });
    try {
      await api("/api/initiate-call", { method: "POST", body: { sessionId }, signal: controller.signal });
      dispatch({ type: "CONNECTED" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      dispatch({
        type: "FAILED",
        message: err instanceof Error ? err.message : "I wasn't able to connect the call right now.",
      });
    }
  }, [sessionId, state.status]);

  return { ...state, start };
}
