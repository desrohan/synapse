"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Thread } from "@/components/assistant-ui/thread";
import { JiraSearchToolUI, JiraIssueToolUI, SlackSearchToolUI, SlackHistoryToolUI, GitHubIssuesToolUI } from "@/components/assistant-ui/tool-uis";
import { ReportToolUI } from "@/components/assistant-ui/report";

export default function Home() {
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

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-xs text-muted-foreground/80 animate-pulse font-medium">
        Initializing Synapse...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-muted/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(var(--primary)/0.06)_0%,transparent_65%)] pointer-events-none -z-10" />
        <Card className="w-full max-w-[340px] border border-border/10 shadow-2xl bg-card/30 backdrop-blur-2xl rounded-2xl">
          <CardContent className="flex flex-col items-center p-8 text-center space-y-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Brain size={24} className="text-primary" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Synapse</h1>
              <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-[240px]">
                Your personalized AI workspace assistant.
              </p>
            </div>
            <Button
              onClick={handleLogin}
              className="mt-4 h-10 w-full rounded-lg text-xs font-medium shadow-md transition-all active:scale-95 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            >
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-muted/10 relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-background to-background pointer-events-none -z-10" />

      {/* Tool UIs — registered once, render anywhere in the chat */}
      <JiraSearchToolUI />
      <JiraIssueToolUI />
      <SlackSearchToolUI />
      <SlackHistoryToolUI />
      <GitHubIssuesToolUI />
      <ReportToolUI />

      <div className="flex-1 h-full overflow-hidden">
        <Thread />
      </div>
    </div>
  );
}
