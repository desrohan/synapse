"use client";

import { useState, useEffect, useMemo } from "react";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

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

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${BACKEND_URL}/api/chat`,
        body: { userId: user?.id },
      }),
    [user?.id],
  );

  const runtime = useChatRuntime({ transport });

  if (isAuthLoading) {
    return (
      <div className="flex h-svh w-screen items-center justify-center bg-background text-muted-foreground animate-pulse">
        Initializing Synapse...
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export { ChatRuntimeProvider };

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider defaultTheme="dark">
      <ChatRuntimeProvider>
        {children}
        <Toaster richColors />
      </ChatRuntimeProvider>
    </ThemeProvider>
  );
}
