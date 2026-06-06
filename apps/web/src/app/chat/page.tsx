"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { createSupabaseHistoryAdapter } from "@/lib/chat-history-adapter";
import { Thread } from "@/components/assistant-ui/thread";
import {
  JiraSearchToolUI,
  JiraIssueToolUI,
  SlackSearchToolUI,
  SlackHistoryToolUI,
  GitHubIssuesToolUI,
} from "@/components/assistant-ui/tool-uis";
import { ReportToolUI } from "@/components/assistant-ui/report";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import {
  PlusIcon,
  MessageSquareIcon,
  Loader2Icon,
  PanelLeftIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ─── Chat Runtime Wrapper ────────────────────────────────────────────────────

function ChatRuntimeWrapper({
  threadId,
  userId,
  children,
  onThreadUpdate,
  initialMessages,
}: {
  threadId: string;
  userId: string;
  children: React.ReactNode;
  onThreadUpdate: () => void;
  initialMessages?: any[];
}) {
  const historyAdapter = useMemo(
    () => createSupabaseHistoryAdapter(threadId, userId),
    [threadId, userId]
  );

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${BACKEND_URL}/api/chat`,
        body: { userId, threadId },
      }),
    [userId, threadId]
  );

  const runtime = useChatRuntime({
    transport,
    adapters: { history: historyAdapter },
    messages: initialMessages?.length ? initialMessages : undefined,
    onFinish: () => {
      onThreadUpdate();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function ChatSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onToggle,
}: {
  threads: ChatThread[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onToggle}
        />
      )}

      <div
        className={cn(
          "flex h-full flex-col border-r bg-background/95 backdrop-blur transition-all duration-200",
          "fixed inset-y-0 left-0 z-40 w-72 md:relative md:z-auto",
          !isOpen && "-translate-x-full md:w-0 md:translate-x-0 md:border-0 md:overflow-hidden"
        )}
        style={{ top: "var(--header-height, 3.5rem)" }}
      >
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-semibold">Chats</span>
          <Button variant="ghost" size="icon" className="size-8" onClick={onNew}>
            <PlusIcon className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No chats yet. Start a new one!
            </p>
          ) : (
            <div className="space-y-0.5">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                    thread.id === activeId
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/50 text-muted-foreground"
                  )}
                  onClick={() => onSelect(thread.id)}
                >
                  <MessageSquareIcon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {thread.title || "New Chat"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(thread.id);
                    }}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <TrashIcon className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Chat Content ────────────────────────────────────────────────────────────

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string>(() => {
    const t = searchParams.get("t");
    return t || crypto.randomUUID();
  });
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [messagesReady, setMessagesReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = user?.id;

  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/chat/history/threads?userId=${userId}`
      );
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      console.error("Failed to fetch threads:", err);
    }
  }, [userId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Pre-load messages for the current thread so they're available before the runtime mounts
  useEffect(() => {
    let cancelled = false;
    setMessagesReady(false);

    const loadMessages = async () => {
      if (!userId) {
        setInitialMessages([]);
        setMessagesReady(true);
        return;
      }
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/chat/history/threads/${currentThreadId}?userId=${userId}`
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const msgs = (data.messages || [])
            .filter((m: any) => m.content && m.content.role)
            .map((m: any) => ({ id: m.id, ...m.content }));
          setInitialMessages(msgs);
        } else {
          setInitialMessages([]);
        }
      } catch {
        if (!cancelled) setInitialMessages([]);
      } finally {
        if (!cancelled) setMessagesReady(true);
      }
    };
    loadMessages();
    return () => { cancelled = true; };
  }, [currentThreadId, userId]);

  const handleNewThread = () => {
    const newId = crypto.randomUUID();
    setInitialMessages([]);
    setCurrentThreadId(newId);
    router.push(`/chat?t=${newId}`, { scroll: false });
  };

  const handleSelectThread = (id: string) => {
    setCurrentThreadId(id);
    router.push(`/chat?t=${id}`, { scroll: false });
  };

  const handleDeleteThread = async (id: string) => {
    if (!user) return;
    await fetch(
      `${BACKEND_URL}/api/chat/history/threads/${id}?userId=${user.id}`,
      { method: "DELETE" }
    );
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (id === currentThreadId) {
      handleNewThread();
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground/80 animate-pulse font-medium">
        Initializing Synapse...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Please sign in to use chat.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-2 top-2 z-20 size-8 md:left-3 md:top-3"
        onClick={() => setSidebarOpen((o) => !o)}
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      {/* Sidebar */}
      <ChatSidebar
        threads={threads}
        activeId={currentThreadId}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
        onDelete={handleDeleteThread}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
      />

      {/* Chat area */}
      <div className="flex-1 h-full overflow-hidden">
        {!messagesReady ? (
          <div className="flex h-full items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <ChatRuntimeWrapper
          key={currentThreadId}
          threadId={currentThreadId}
          userId={user.id}
          onThreadUpdate={fetchThreads}
          initialMessages={initialMessages}
        >
          <JiraSearchToolUI />
          <JiraIssueToolUI />
          <SlackSearchToolUI />
          <SlackHistoryToolUI />
          <GitHubIssuesToolUI />
          <ReportToolUI />

          <div className="flex h-full flex-col bg-muted/10 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-background to-background pointer-events-none -z-10" />
            <div className="flex-1 h-full overflow-hidden">
              <Thread />
            </div>
          </div>
        </ChatRuntimeWrapper>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
