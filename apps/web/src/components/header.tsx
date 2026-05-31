"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ModeToggle } from "./mode-toggle";
import {
  Brain,
  Code,
  MessageCircle,
  ListTodo,
  Check,
  PlugIcon,
  LogOut,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

const INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub",
    icon: Code,
    description: "Repositories, issues, and pull requests",
  },
  {
    id: "slack",
    name: "Slack",
    icon: MessageCircle,
    description: "Channels, messages, and threads",
  },
  {
    id: "jira",
    name: "Jira",
    icon: ListTodo,
    description: "Projects, tickets, and sprints",
  },
] as const;

function IntegrationCard({
  integration,
  connected,
  userId,
  onDisconnect,
}: {
  integration: (typeof INTEGRATIONS)[number];
  connected: boolean;
  userId: string;
  onDisconnect: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = integration.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{integration.name}</span>
        <span className="text-xs text-muted-foreground">
          {integration.description}
        </span>
      </div>
      {connected ? (
        <Button
          variant="ghost"
          size="sm"
          className="group relative h-8 rounded-full bg-green-500/10 px-3 text-xs font-medium text-green-600 hover:bg-destructive/10 hover:text-destructive dark:text-green-400 dark:hover:text-red-400"
          onClick={() => onDisconnect(integration.id)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isHovered ? (
            "Disconnect"
          ) : (
            <>
              <Check className="mr-1 size-3" />
              Connected
            </>
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            window.location.href = `${BACKEND_URL}/api/integrations/${integration.id}/authorize?userId=${userId}`;
          }}
        >
          Connect
        </Button>
      )}
    </div>
  );
}

export default function Header() {
  const [user, setUser] = useState<any>(null);
  const [connectedApps, setConnectedApps] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetch(`${BACKEND_URL}/api/integrations/status?userId=${user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.connected) setConnectedApps(data.connected);
        })
        .catch(console.error);
    }
  }, [user]);

  const handleDisconnect = async (integrationId: string) => {
    if (!user) return;
    try {
      await fetch(`${BACKEND_URL}/api/integrations/${integrationId}?userId=${user.id}`, { method: 'DELETE' });
      setConnectedApps(prev => prev.filter(id => id !== integrationId));
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || "User";
  const email = user?.email || "";

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center gap-2">
            <div className="rounded-md bg-primary/20 p-1.5 text-primary">
              <Brain size={20} />
            </div>
            <span className="font-bold tracking-tight text-lg sm:inline-block">
              Synapse
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <nav className="flex items-center gap-1">
            {user && (
              <>
                <Link
                  href="/chat"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Chat
                </Link>
                <Link
                  href="/automations"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Automations
                </Link>
                <Dialog>
                  <DialogTrigger className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                    <PlugIcon className="size-4" />
                    Integrations
                    {connectedApps.length > 0 && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                        {connectedApps.length}
                      </span>
                    )}
                  </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Integrations</DialogTitle>
                    <DialogDescription>
                      Connect your tools so Synapse can search and act across
                      your workspace.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    {INTEGRATIONS.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        connected={connectedApps.includes(integration.id)}
                        userId={user.id}
                        onDisconnect={handleDisconnect}
                      />
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              </>
            )}
          </nav>
          <div className="mx-2 h-4 w-px bg-border" />
          <ModeToggle />
          {user && (
            <>
              <div className="mx-2 h-4 w-px bg-border" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button className="flex items-center justify-center rounded-full border border-border bg-background shadow-xs transition-all duration-200 hover:opacity-90 active:scale-95 size-8 overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  }
                >
                  <Avatar>
                    {avatarUrl && (
                      <AvatarImage
                        src={avatarUrl}
                        alt={fullName}
                      />
                    )}
                    <AvatarFallback className="font-semibold text-xs text-foreground bg-primary/10">
                      {getInitials(fullName || email || "U")}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="w-56 p-2 rounded-xl bg-popover/90 backdrop-blur-md border border-border/50 shadow-lg text-popover-foreground z-50"
                >
                  <div className="px-2.5 py-2 flex flex-col space-y-0.5">
                    <span className="font-medium text-sm leading-tight text-foreground truncate">
                      {fullName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate font-normal">
                      {email}
                    </span>
                  </div>
                  <DropdownMenuSeparator className="my-1.5 bg-border/50" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    variant="destructive"
                    className="flex items-center gap-2 cursor-pointer w-full rounded-lg px-2.5 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
