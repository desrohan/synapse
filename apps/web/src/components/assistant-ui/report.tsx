"use client";

import { useState } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
  Loader2Icon,
  CircleAlertIcon,
  ArrowUpRightIcon,
  MessageSquareIcon,
  ListTodoIcon,
  GitBranchIcon,
  HashIcon,
  ChevronRightIcon,
  FileTextIcon,
  XIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportItem {
  title: string;
  description: string;
  source: string;
  channel?: string;
  author?: string;
  date?: string;
  permalink?: string;
}

export interface ChannelSummary {
  name: string;
  messageCount?: number;
  summary: string;
}

export interface ReportData {
  title: string;
  subtitle?: string;
  actionItems?: ReportItem[];
  updates?: ReportItem[];
  channelSummaries?: ChannelSummary[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { icon: typeof MessageSquareIcon; label: string; color: string }> = {
  slack: { icon: MessageSquareIcon, label: "Slack", color: "text-[#E01E5A] dark:text-[#E01E5A]" },
  jira: { icon: ListTodoIcon, label: "Jira", color: "text-[#0052CC] dark:text-[#4C9AFF]" },
  github: { icon: GitBranchIcon, label: "GitHub", color: "text-[#8B949E] dark:text-[#8B949E]" },
};

function SourceIcon({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source.toLowerCase()] || SOURCE_CONFIG.slack;
  const Icon = config.icon;
  return <Icon className={cn("size-3.5 shrink-0", config.color)} />;
}


function ReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-xl font-bold tracking-tight">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function ActionItemCard({ item }: { item: ReportItem }) {
  const Wrapper = item.permalink ? "a" : "div";
  const linkProps = item.permalink
    ? { href: item.permalink, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...linkProps}
      className="group flex gap-3 rounded-lg border border-border/50 bg-card/50 p-3.5 transition-colors hover:bg-accent/30 no-underline text-inherit"
    >
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-primary/40" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-snug">{item.title}</span>
          {item.permalink && (
            <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <SourceIcon source={item.source} />
        </div>
      </div>
    </Wrapper>
  );
}

function UpdateCard({ item, index }: { item: ReportItem; index: number }) {
  const Wrapper = item.permalink ? "a" : "div";
  const linkProps = item.permalink
    ? { href: item.permalink, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...linkProps}
      className="group flex gap-3.5 py-3 border-b border-border/20 last:border-0 no-underline text-inherit"
    >
      <span className="mt-0.5 font-serif text-sm font-light text-muted-foreground/40 tabular-nums w-5 shrink-0 text-right">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-snug">{item.title}</span>
          {item.permalink && (
            <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <SourceIcon source={item.source} />
        </div>
      </div>
    </Wrapper>
  );
}

function ChannelSummaryCard({ channel }: { channel: ChannelSummary }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <HashIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{channel.name}</span>
          {channel.messageCount != null && (
            <span className="text-[11px] text-muted-foreground/50">
              {channel.messageCount} messages
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{channel.summary}</p>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 font-serif text-sm font-semibold italic text-foreground/80 tracking-wide">
      {children}
    </h3>
  );
}

// ─── Report Component ────────────────────────────────────────────────────────

export function Report({ data }: { data: ReportData }) {
  const hasActions = data.actionItems && data.actionItems.length > 0;
  const hasUpdates = data.updates && data.updates.length > 0;
  const hasChannels = data.channelSummaries && data.channelSummaries.length > 0;

  return (
    <div className="my-2 w-full max-w-[540px] overflow-hidden rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm">
      {/* Header bar */}
      <div className="border-b border-border/30 px-5 py-4">
        <ReportHeader title={data.title} subtitle={data.subtitle} />
      </div>

      <div className="divide-y divide-border/20">
        {/* Action Items */}
        {hasActions && (
          <div className="px-5 py-4">
            <SectionHeader>Action items</SectionHeader>
            <div className="space-y-2">
              {data.actionItems!.map((item, i) => (
                <ActionItemCard key={i} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Updates */}
        {hasUpdates && (
          <div className="px-5 py-4">
            <SectionHeader>Updates</SectionHeader>
            <div>
              {data.updates!.map((item, i) => (
                <UpdateCard key={i} item={item} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Channel Summaries */}
        {hasChannels && (
          <div className="px-5 py-4">
            <SectionHeader>Channel activity</SectionHeader>
            <div className="space-y-1">
              {data.channelSummaries!.map((ch, i) => (
                <ChannelSummaryCard key={i} channel={ch} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool UI Registration ────────────────────────────────────────────────────

function parseReportResult(result: unknown): ReportData | null {
  if (!result) return null;
  try {
    const r = result as Record<string, unknown>;
    // The tool result may be wrapped in content array
    if (Array.isArray(r.content)) {
      const textContent = r.content.find((c: any) => c.type === "text");
      if (textContent) {
        return JSON.parse((textContent as any).text) as ReportData;
      }
    }
    if (typeof r.content === "string") {
      return JSON.parse(r.content) as ReportData;
    }
    // Direct object
    if (r.title) return r as unknown as ReportData;
    return null;
  } catch {
    return null;
  }
}

function ReportButton({ data }: { data: ReportData }) {
  const [open, setOpen] = useState(false);

  const itemCount =
    (data.actionItems?.length ?? 0) +
    (data.updates?.length ?? 0);

  if (open) {
    return (
      <div className="my-2 w-full max-w-[540px]">
        <button
          onClick={() => setOpen(false)}
          className="mb-2 flex w-full items-center justify-between rounded-lg border border-border/40 bg-card/50 px-4 py-2.5 text-left transition-colors hover:bg-accent/30"
        >
          <div className="flex items-center gap-2.5">
            <FileTextIcon className="size-4 text-primary/70" />
            <span className="text-sm font-medium">{data.title}</span>
          </div>
          <XIcon className="size-3.5 text-muted-foreground" />
        </button>
        <Report data={data} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="group my-2 flex w-full max-w-[540px] items-center justify-between rounded-lg border border-border/40 bg-card/50 px-4 py-3 text-left transition-colors hover:bg-accent/30"
    >
      <div className="flex items-center gap-2.5">
        <FileTextIcon className="size-4 text-primary/70" />
        <span className="text-sm font-medium">{data.title}</span>
        {data.subtitle && (
          <span className="text-xs text-muted-foreground">{data.subtitle}</span>
        )}
        {itemCount > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        )}
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export const ReportToolUI = makeAssistantToolUI<Record<string, unknown>, unknown>({
  toolName: "generateReport",
  render: ({ result, status }) => {
    if (status.type === "running") {
      return (
        <div className="my-2 flex w-full max-w-[540px] items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-4 py-3">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Preparing report…</span>
        </div>
      );
    }

    const data = parseReportResult(result);
    if (!data) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <CircleAlertIcon className="size-4" />
          Could not render report.
        </div>
      );
    }

    return <ReportButton data={data} />;
  },
});
