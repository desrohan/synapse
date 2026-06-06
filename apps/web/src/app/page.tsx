"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  Brain,
  CheckCircle2Icon,
  CircleIcon,
  FileTextIcon,
  ChevronRightIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  XIcon,
  Loader2Icon,
  GlobeIcon,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Report as ReportView } from "@/components/assistant-ui/report";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

interface Todo {
  id: string;
  title: string;
  description: string | null;
  source: string;
  source_permalink: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  title: string;
  subtitle: string | null;
  report_type: string;
  data: any;
  generated_at: string;
}

interface Schedule {
  id: string;
  schedule_type: string;
  enabled: boolean;
  time_utc: string;
  day_of_week: number | null;
  timezone: string;
  delivery_channel: string;
}

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
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Synapse
              </h1>
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

  return <Dashboard userId={user.id} />;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ userId }: { userId: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [timezones, setTimezones] = useState<{ value: string; label: string; offset: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);

  // Pagination state
  const [todosHasMore, setTodosHasMore] = useState(false);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [todosLoading, setTodosLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);

  const todosEndRef = useRef<HTMLDivElement>(null);
  const reportsEndRef = useRef<HTMLDivElement>(null);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [todosRes, reportsRes, schedulesRes, timezonesRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/dashboard/todos?userId=${userId}&limit=15&offset=0`),
        fetch(`${BACKEND_URL}/api/dashboard/reports?userId=${userId}&limit=8&offset=0`),
        fetch(`${BACKEND_URL}/api/dashboard/schedules?userId=${userId}`),
        fetch(`${BACKEND_URL}/api/dashboard/timezones`).catch(() => null),
      ]);

      const [todosData, reportsData, schedulesData] = await Promise.all([
        todosRes.json(),
        reportsRes.json(),
        schedulesRes.json(),
      ]);

      let timezonesData = { timezones: [] };
      if (timezonesRes && timezonesRes.ok) {
        try {
          timezonesData = await timezonesRes.json();
        } catch (e) {
          console.error("Failed to parse timezones JSON:", e);
        }
      }

      setTodos(todosData.todos || []);
      setTodosHasMore(todosData.hasMore ?? false);
      setReports(reportsData.reports || []);
      setReportsHasMore(reportsData.hasMore ?? false);
      setSchedules(schedulesData.schedules || []);
      setTimezones(timezonesData.timezones || []);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const loadMoreTodos = useCallback(async () => {
    if (todosLoading || !todosHasMore) return;
    setTodosLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/dashboard/todos?userId=${userId}&limit=15&offset=${todos.length}`
      );
      const data = await res.json();
      setTodos((prev) => [...prev, ...(data.todos || [])]);
      setTodosHasMore(data.hasMore ?? false);
    } finally {
      setTodosLoading(false);
    }
  }, [userId, todos.length, todosLoading, todosHasMore]);

  const loadMoreReports = useCallback(async () => {
    if (reportsLoading || !reportsHasMore) return;
    setReportsLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/dashboard/reports?userId=${userId}&limit=8&offset=${reports.length}`
      );
      const data = await res.json();
      setReports((prev) => [...prev, ...(data.reports || [])]);
      setReportsHasMore(data.hasMore ?? false);
    } finally {
      setReportsLoading(false);
    }
  }, [userId, reports.length, reportsLoading, reportsHasMore]);

  // Intersection observers for infinite scroll
  useEffect(() => {
    const el = todosEndRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreTodos();
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreTodos]);

  useEffect(() => {
    const el = reportsEndRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreReports();
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreReports]);

  const toggleTodo = async (todo: Todo) => {
    const newStatus = todo.status === "pending" ? "done" : "pending";
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, status: newStatus } : t))
    );
    await fetch(`${BACKEND_URL}/api/dashboard/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status: newStatus }),
    });
  };

  const dismissTodo = async (todoId: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
    await fetch(`${BACKEND_URL}/api/dashboard/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status: "dismissed" }),
    });
  };

  const updateSchedule = async (
    type: "daily" | "weekly",
    updates: Partial<Schedule>
  ) => {
    const res = await fetch(`${BACKEND_URL}/api/dashboard/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, schedule_type: type, ...updates }),
    });
    const data = await res.json();
    if (data.schedule) {
      setSchedules((prev) => {
        const existing = prev.findIndex((s) => s.schedule_type === type);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = data.schedule;
          return copy;
        }
        return [...prev, data.schedule];
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8 overflow-y-auto h-full">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your workspace at a glance
        </p>
      </div>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6 sm:space-y-8 min-w-0">
          {/* Action Items / Todos */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">
                Action Items
              </h2>
              <span className="text-xs text-muted-foreground">
                {todos.filter((t) => t.status === "pending").length} pending
              </span>
            </div>
            {todos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No action items yet. Ask Synapse about your workspace to
                generate them.
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto rounded-lg">
                <div className="space-y-1">
                  {todos.map((todo) => (
                    <div
                      key={todo.id}
                      className={cn(
                        "group flex items-start gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:bg-accent/20",
                        todo.status === "done" && "opacity-50"
                      )}
                    >
                      <button
                        onClick={() => toggleTodo(todo)}
                        className="mt-0.5 shrink-0"
                      >
                        {todo.status === "done" ? (
                          <CheckCircle2Icon className="size-4 text-primary" />
                        ) : (
                          <CircleIcon className="size-4 text-muted-foreground/50 hover:text-primary" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium leading-snug",
                            todo.status === "done" && "line-through"
                          )}
                        >
                          {todo.title}
                        </p>
                        {todo.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {todo.description}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          {todo.source && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                              {todo.source}
                            </span>
                          )}
                          {todo.source_permalink && (
                            <a
                              href={todo.source_permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary/70 hover:underline"
                            >
                              View source →
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => dismissTodo(todo.id)}
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <XIcon className="size-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Scroll sentinel */}
                <div ref={todosEndRef} className="h-1" />
                {todosLoading && (
                  <div className="flex justify-center py-2">
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Recent Reports */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">Reports</h2>
              <Link
                href="/chat"
                className="text-xs text-primary hover:underline"
              >
                Generate new →
              </Link>
            </div>
            {reports.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No reports yet. Ask Synapse for a daily brief or weekly recap.
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto rounded-lg">
                <div className="space-y-2">
                  {reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => setSelectedReport(report)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:bg-accent/20"
                    >
                      <FileTextIcon className="size-4 shrink-0 text-primary/70" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {report.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatReportSubtitle(report.subtitle, report.generated_at, report.report_type)}
                        </p>
                      </div>
                      <span className="hidden sm:inline rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                        {report.report_type}
                      </span>
                      <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
                {/* Scroll sentinel */}
                <div ref={reportsEndRef} className="h-1" />
                {reportsLoading && (
                  <div className="flex justify-center py-2">
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schedule Config */}
          <section>
            <h3 className="mb-3 font-serif text-sm font-semibold">
              Report Schedule
            </h3>
            <div className="space-y-3">
              <ScheduleCard
                label="Daily Brief"
                type="daily"
                schedule={schedules.find((s) => s.schedule_type === "daily")}
                timezones={timezones}
                onUpdate={(updates) => updateSchedule("daily", updates)}
              />
              <ScheduleCard
                label="Weekly Recap"
                type="weekly"
                schedule={schedules.find((s) => s.schedule_type === "weekly")}
                timezones={timezones}
                onUpdate={(updates) => updateSchedule("weekly", updates)}
              />
            </div>
          </section>

          {/* Quick Links */}
          <section>
            <h3 className="mb-3 font-serif text-sm font-semibold">
              Quick Links
            </h3>
            <div className="space-y-1">
              <Link
                href="/chat"
                className="flex items-center gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-accent/30"
              >
                <PlusIcon className="size-3.5 text-muted-foreground" />
                New Chat
              </Link>
              <Link
                href="/automations"
                className="flex items-center gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-accent/30"
              >
                <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                Automations
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Report Detail Sidebar */}
      <Sheet
        open={!!selectedReport}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-serif">
              {selectedReport?.title}
            </SheetTitle>
            {selectedReport?.subtitle && (
              <p className="text-sm text-muted-foreground">
                {selectedReport.subtitle}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                {selectedReport?.report_type}
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedReport && formatReportGeneratedAt(selectedReport.generated_at)}
              </span>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {selectedReport?.data && (
              <ReportView data={selectedReport.data} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Schedule Card ──────────────────────────────────────────────────────────

function ScheduleCard({
  label,
  type,
  schedule,
  timezones,
  onUpdate,
}: {
  label: string;
  type: "daily" | "weekly";
  schedule: Schedule | undefined;
  timezones: { value: string; label: string; offset: string }[];
  onUpdate: (updates: Partial<Schedule>) => void;
}) {
  const enabled = schedule?.enabled ?? false;
  const [time, setTime] = useState(schedule?.time_utc || "09:00");
  const [timezone, setTimezone] = useState("UTC");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const getMappedTimezone = (tz: string) => {
    if (!tz) return "UTC";
    if (timezones.some(t => t.value === tz)) return tz;
    // Map common legacy/modern variants for Trigger.dev compatibility
    if (tz === "Asia/Kolkata") return "Asia/Calcutta";
    if (tz === "Asia/Kathmandu") return "Asia/Katmandu";
    if (tz === "Asia/Yangon") return "Asia/Rangoon";
    if (tz === "Europe/Kyiv") return "Europe/Kiev";
    return tz;
  };

  useEffect(() => {
    if (schedule?.time_utc) setTime(schedule.time_utc);
  }, [schedule?.time_utc]);

  useEffect(() => {
    if (schedule?.timezone) {
      setTimezone(getMappedTimezone(schedule.timezone));
    } else if (timezones.length > 0) {
      setTimezone(getMappedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone));
    }
  }, [schedule?.timezone, timezones]);

  const save = (overrides: { time_utc?: string; timezone?: string } = {}) => {
    const finalTime = overrides.time_utc ?? time;
    const finalTz = overrides.timezone ?? timezone;
    onUpdate({ enabled, time_utc: finalTime, timezone: finalTz });
  };

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    if (/^\d{2}:\d{2}$/.test(newTime)) {
      save({ time_utc: newTime });
    }
  };

  const handleTimezoneChange = (tz: string) => {
    const mappedTz = getMappedTimezone(tz);
    setTimezone(mappedTz);
    save({ timezone: mappedTz });
  };

  const formatLocalTime = () => {
    try {
      const [h, m] = time.split(":");
      const now = new Date();
      
      // Find the difference between the target timezone and the browser's local timezone
      const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const localDate = new Date(now.toLocaleString("en-US"));
      const diffMs = tzDate.getTime() - localDate.getTime();
      
      // Calculate the local time representation of the scheduled time
      const scheduledTzDate = new Date(now);
      scheduledTzDate.setHours(parseInt(h), parseInt(m), 0, 0);
      
      const scheduledLocalDate = new Date(scheduledTzDate.getTime() - diffMs);
      
      return scheduledLocalDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return time;
    }
  };

  const filteredTimezones = (timezones.length > 0 ? timezones : FALLBACK_TIMEZONES).filter((tz) =>
    tz.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button
          onClick={() =>
            onUpdate({ enabled: !enabled, time_utc: time, timezone })
          }
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            enabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "inline-block size-3.5 rounded-full bg-white transition-transform",
              enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            )}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            <input
              type="time"
              value={time}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <GlobeIcon className="size-3.5 text-muted-foreground" />
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger
                className="flex h-8 flex-1 items-center justify-between gap-1.5 rounded-3xl border border-border bg-input/50 px-3 py-2 text-xs whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
              >
                <span className="truncate">
                  {timezones.find((tz) => tz.value === timezone)?.label || timezone}
                </span>
                <ChevronsUpDown className="pointer-events-none size-3 text-muted-foreground shrink-0" />
              </PopoverTrigger>
              <PopoverContent
                className="z-50 flex w-[280px] flex-col gap-2 rounded-3xl bg-popover p-2 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 dark:ring-foreground/10"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <div className="flex flex-col h-[280px]">
                  <div className="border-b border-border/40 pb-2 mb-1 px-1">
                    <input
                      type="text"
                      placeholder="Search timezone..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-input/40 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/20 border border-border/30 rounded-2xl text-foreground placeholder:text-muted-foreground/60"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
                    {filteredTimezones.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No timezone found
                      </div>
                    ) : (
                      filteredTimezones.map((tz) => {
                        const isSelected = tz.value === timezone;
                        return (
                          <button
                            key={tz.value}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTimezoneChange(tz.value);
                              setOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-2xl text-xs transition-colors flex items-center justify-between cursor-pointer select-none",
                              isSelected
                                ? "bg-primary text-primary-foreground font-medium"
                                : "hover:bg-accent hover:text-accent-foreground text-foreground"
                            )}
                          >
                            <span className="truncate mr-2">{tz.label}</span>
                            {isSelected && (
                              <CheckCircle2Icon className="size-3.5 shrink-0 text-current" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Delivers at {formatLocalTime()} local time
          </p>
        </div>
      )}
    </div>
  );
}

const FALLBACK_TIMEZONES = [
  { value: "America/New_York", label: "America/New_York (GMT-04:00)", offset: "GMT-04:00" },
  { value: "America/Chicago", label: "America/Chicago (GMT-05:00)", offset: "GMT-05:00" },
  { value: "America/Denver", label: "America/Denver (GMT-06:00)", offset: "GMT-06:00" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (GMT-07:00)", offset: "GMT-07:00" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (GMT-03:00)", offset: "GMT-03:00" },
  { value: "Europe/London", label: "Europe/London (GMT+01:00)", offset: "GMT+01:00" },
  { value: "Europe/Paris", label: "Europe/Paris (GMT+02:00)", offset: "GMT+02:00" },
  { value: "Europe/Berlin", label: "Europe/Berlin (GMT+02:00)", offset: "GMT+02:00" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GMT+04:00)", offset: "GMT+04:00" },
  { value: "Asia/Calcutta", label: "Asia/Calcutta (GMT+05:30)", offset: "GMT+05:30" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (GMT+08:00)", offset: "GMT+08:00" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (GMT+09:00)", offset: "GMT+09:00" },
  { value: "Asia/Singapore", label: "Asia/Singapore (GMT+08:00)", offset: "GMT+08:00" },
  { value: "Australia/Sydney", label: "Australia/Sydney (GMT+10:00)", offset: "GMT+10:00" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (GMT+12:00)", offset: "GMT+12:00" },
  { value: "UTC", label: "UTC (GMT+00:00)", offset: "GMT+00:00" },
];

const formatReportGeneratedAt = (generatedAt: string) => {
  try {
    const d = new Date(generatedAt);
    const dateStr = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');
    const timeStr = `${hoursStr}:${minutes} ${ampm}`;
    
    return `${dateStr} at ${timeStr}`;
  } catch (err) {
    return generatedAt;
  }
};

const formatReportSubtitle = (subtitle: string | null, generatedAt: string, reportType: string) => {
  try {
    let timeRange = '';
    if (subtitle) {
      const parts = subtitle.split(" · ");
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (/\b\d{4}\b/.test(lastPart)) {
          // Remove the last part (it contains a 4-digit year, so it's probably a date)
          timeRange = parts.slice(0, parts.length - 1).join(" · ");
        } else {
          timeRange = subtitle;
        }
      } else {
        timeRange = subtitle;
      }
    } else {
      timeRange = reportType === 'weekly' ? 'Last 7 days' : 'Last 24 hours';
    }
    
    const d = new Date(generatedAt);
    const dateStr = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');
    const timeStr = `${hoursStr}:${minutes} ${ampm}`;
    
    return `${timeRange} · ${dateStr}, ${timeStr}`;
  } catch (err) {
    return subtitle || '';
  }
};
