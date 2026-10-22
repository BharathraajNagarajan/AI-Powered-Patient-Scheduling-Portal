"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, clearStoredSessionId, readStoredSessionId } from "@/lib/client";
import type { ChatMessage, ChatResponse, ChatUi, PublicSession } from "@/lib/types";

type Status = "loading" | "ready";
type PendingKind = "chat" | "slot" | "booking" | null;

interface State {
  status: Status;
  session: PublicSession | null;
  messages: ChatMessage[];
  ui: ChatUi;
  pending: PendingKind;
  error: string | null;
}

type Action =
  | { type: "INIT"; session: PublicSession; ui: ChatUi }
  | { type: "SEND"; message: ChatMessage }
  | { type: "RECEIVE"; response: ChatResponse }
  | { type: "SELECT_SLOT" }
  | { type: "BOOKING_PENDING" }
  | { type: "BOOKED"; response: ChatResponse }
  | { type: "DISMISS_ERROR" }
  | { type: "ERROR"; message: string };

const initial: State = { status: "loading", session: null, messages: [], ui: {}, pending: null, error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT":
      return { ...state, status: "ready", session: action.session, messages: action.session.messages, ui: action.ui, pending: null };
    case "SEND":
      return { ...state, messages: [...state.messages, action.message], pending: "chat", error: null };
    case "RECEIVE":
    case "BOOKED":
      return {
        ...state,
        session: action.response.session,
        messages: action.response.session.messages,
        ui: action.response.ui,
        pending: null,
        error: null,
      };
    case "SELECT_SLOT":
      return { ...state, pending: "slot", error: null };
    case "BOOKING_PENDING":
      return { ...state, pending: "booking", error: null };
    case "DISMISS_ERROR":
      return { ...state, error: null };
    case "ERROR":
      return { ...state, pending: null, error: action.message };
  }
}

export function useChatSession() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initial);
  const sessionIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const initialStartedRef = useRef(false);
  const controllersRef = useRef(new Set<AbortController>());

  const request = useCallback(async <T>(fn: (signal: AbortSignal) => Promise<T>) => {
    const seq = ++seqRef.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    try {
      const value = await fn(controller.signal);
      return { stale: seq !== seqRef.current, value };
    } finally {
      controllersRef.current.delete(controller);
    }
  }, []);

  const fail = useCallback((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    dispatch({ type: "ERROR", message: err instanceof Error ? err.message : "Something went wrong. Please try again." });
  }, []);

  const refresh = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      const { stale, value } = await request((signal) =>
        api<{ session: PublicSession; ui: ChatUi }>(`/api/session/${id}`, { signal })
      );
      if (!stale) dispatch({ type: "INIT", session: value.session, ui: value.ui });
    } catch (err) {
      fail(err);
    }
  }, [request, fail]);

  const sendInitial = useCallback(
    async (id: string) => {
      dispatch({ type: "SELECT_SLOT" });
      try {
        const { stale, value } = await request((signal) =>
          api<ChatResponse>("/api/chat", { method: "POST", body: { sessionId: id, initial: true }, signal })
        );
        if (!stale) dispatch({ type: "RECEIVE", response: value });
      } catch (err) {
        fail(err);
      }
    },
    [request, fail]
  );

  useEffect(() => {
    const controllers = controllersRef.current;
    const id = readStoredSessionId();
    if (!id) {
      router.replace("/");
      return;
    }
    sessionIdRef.current = id;

    (async () => {
      try {
        const { stale, value } = await request((signal) =>
          api<{ session: PublicSession; ui: ChatUi }>(`/api/session/${id}`, { signal })
        );
        if (stale) return;
        dispatch({ type: "INIT", session: value.session, ui: value.ui });
        if (value.session.messages.length <= 1 && !initialStartedRef.current) {
          initialStartedRef.current = true;
          await sendInitial(id);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          clearStoredSessionId();
          router.replace("/");
          return;
        }
        fail(err);
      }
    })();

    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, [router, request, sendInitial, fail]);

  const send = useCallback(
    async (text: string) => {
      const id = sessionIdRef.current;
      const trimmed = text.trim();
      if (!id || !trimmed) return;
      dispatch({
        type: "SEND",
        message: { role: "user", content: trimmed, timestamp: new Date().toISOString() },
      });
      try {
        const { stale, value } = await request((signal) =>
          api<ChatResponse>("/api/chat", { method: "POST", body: { sessionId: id, message: trimmed }, signal })
        );
        if (!stale) dispatch({ type: "RECEIVE", response: value });
      } catch (err) {
        fail(err);
      }
    },
    [request, fail]
  );

  const selectSlot = useCallback(
    async (slotId: string) => {
      const id = sessionIdRef.current;
      if (!id) return;
      dispatch({ type: "SELECT_SLOT" });
      try {
        const { stale, value } = await request((signal) =>
          api<ChatResponse>("/api/slots/select", { method: "POST", body: { sessionId: id, slotId }, signal })
        );
        if (!stale) dispatch({ type: "RECEIVE", response: value });
      } catch (err) {
        fail(err);
        if (err instanceof ApiError && err.status === 409) await refresh();
      }
    },
    [request, fail, refresh]
  );

  const confirmBooking = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    dispatch({ type: "BOOKING_PENDING" });
    try {
      const { stale, value } = await request((signal) =>
        api<ChatResponse>("/api/book", { method: "POST", body: { sessionId: id }, signal })
      );
      if (!stale) dispatch({ type: "BOOKED", response: value });
    } catch (err) {
      fail(err);
      if (err instanceof ApiError && err.status === 409) await refresh();
    }
  }, [request, fail, refresh]);

  const dismissError = useCallback(() => dispatch({ type: "DISMISS_ERROR" }), []);

  return {
    ...state,
    sessionId: state.session?.sessionId ?? null,
    send,
    selectSlot,
    confirmBooking,
    dismissError,
  };
}
