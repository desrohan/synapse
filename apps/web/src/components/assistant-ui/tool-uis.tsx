"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
  ExternalLinkIcon,
  ListTodoIcon,
  MessageSquareIcon,
  GitBranchIcon,
  CircleDotIcon,
  UserIcon,
  HashIcon,
  Loader2Icon,
} from "lucide-react";

// ─── Jira ────────────────────────────────────────────────────────────────────

interface JiraIssue {
  key: string;
  summary: string;
  status?: string;
  assignee?: string;
  type?: string;
  priority?: string;
}

const JIRA_STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  "In Progress": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "In Review": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Done: "bg-green-500/15 text-green-600 dark:text-green-400",
  Closed: "bg-green-500/15 text-green-600 dark:text-green-400",
};

function JiraStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const colors =
    JIRA_STATUS_COLORS[status] ||
    "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors,
      )}
    >
      {status}
    </span>
  );
}

function JiraIssueCard({ issue }: { issue: JiraIssue }) {
  // Try to build a Jira URL from the issue key
  const projectKey = issue.key?.split("-")[0];
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-blue-500/10">
        <ListTodoIcon className="size-4 text-blue-500" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {issue.key}
          </span>
          <JiraStatusBadge status={issue.status} />
          {issue.type && (
            <span className="text-xs text-muted-foreground">{issue.type}</span>
          )}
        </div>
        <span className="text-sm font-medium leading-snug">
          {issue.summary}
        </span>
        {issue.assignee && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <UserIcon className="size-3" />
            {issue.assignee}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </div>
  );
}

/** Parses the tool result which could be an array or an object with content. */
function parseResult<T>(result: unknown): T[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.issues)) return r.issues as T[];
  if (typeof r.content === "string") {
    try {
      const parsed = JSON.parse(r.content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  // Single object result
  if (r.key && r.summary) return [result as T];
  return [];
}

export const JiraSearchToolUI = makeAssistantToolUI<
  { jql?: string; action?: string; query?: string },
  unknown
>({
  toolName: "jira__jira_search",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolLoading label={`Searching Jira${args.jql ? `: ${args.jql}` : ""}…`} />;
    }

    const issues = parseResult<JiraIssue>(result);

    if (issues.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No Jira issues found.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListTodoIcon className="size-3.5" />
          {issues.length} Jira issue{issues.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-col gap-1.5">
          {issues.map((issue) => (
            <JiraIssueCard key={issue.key} issue={issue} />
          ))}
        </div>
      </div>
    );
  },
});

export const JiraIssueToolUI = makeAssistantToolUI<
  { issueKey?: string; action?: string },
  unknown
>({
  toolName: "jira__jira_issues",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolLoading label={`Fetching ${args.issueKey || "issue"}…`} />;
    }

    const issues = parseResult<JiraIssue>(result);
    if (issues.length === 0) return null;

    return (
      <div className="flex flex-col gap-1.5">
        {issues.map((issue) => (
          <JiraIssueCard key={issue.key} issue={issue} />
        ))}
      </div>
    );
  },
});

// ─── Slack ───────────────────────────────────────────────────────────────────

interface SlackMessage {
  text?: string;
  user?: string;
  channel?: string;
  ts?: string;
  permalink?: string;
  username?: string;
}

function SlackMessageCard({ message }: { message: SlackMessage }) {
  return (
    <a
      href={message.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <div className="rounded-lg border-l-4 border-l-[#4A154B] bg-card p-3 transition-colors hover:bg-accent/50">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          {message.channel && (
            <span className="flex items-center gap-1">
              <HashIcon className="size-3" />
              {message.channel}
            </span>
          )}
          {(message.user || message.username) && (
            <span className="flex items-center gap-1">
              <UserIcon className="size-3" />
              {message.username || message.user}
            </span>
          )}
          {message.permalink && (
            <ExternalLinkIcon className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.text}
        </p>
      </div>
    </a>
  );
}

function parseSlackMessages(result: unknown): SlackMessage[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.messages)) return r.messages;
  if (typeof r.content === "string") {
    try {
      const parsed = JSON.parse(r.content);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.messages)) return parsed.messages;
      if (parsed.text) return [parsed];
      return [];
    } catch {
      // Plain text message from Slack - show as a single message
      return [{ text: r.content as string }];
    }
  }
  if (r.text) return [r as unknown as SlackMessage];
  return [];
}

export const SlackSearchToolUI = makeAssistantToolUI<
  { query?: string },
  unknown
>({
  toolName: "slack__slack_search_messages",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolLoading label={`Searching Slack${args.query ? ` for "${args.query}"` : ""}…`} />;
    }

    const messages = parseSlackMessages(result);

    if (messages.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No Slack messages found.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquareIcon className="size-3.5" />
          {messages.length} Slack message{messages.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-col gap-1.5">
          {messages.map((msg, i) => (
            <SlackMessageCard key={msg.ts || i} message={msg} />
          ))}
        </div>
      </div>
    );
  },
});

export const SlackHistoryToolUI = makeAssistantToolUI<
  { channel_id?: string },
  unknown
>({
  toolName: "slack__slack_get_channel_history",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolLoading label="Fetching Slack history…" />;
    }

    const messages = parseSlackMessages(result);
    if (messages.length === 0) return null;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquareIcon className="size-3.5" />
          Channel history · {messages.length} message{messages.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-col gap-1.5">
          {messages.slice(0, 10).map((msg, i) => (
            <SlackMessageCard key={msg.ts || i} message={msg} />
          ))}
          {messages.length > 10 && (
            <div className="text-xs text-muted-foreground text-center py-1">
              +{messages.length - 10} more messages
            </div>
          )}
        </div>
      </div>
    );
  },
});

// ─── GitHub ──────────────────────────────────────────────────────────────────

interface GitHubIssue {
  number?: number;
  title?: string;
  state?: string;
  url?: string;
  html_url?: string;
  user?: { login?: string } | string;
  labels?: Array<{ name: string; color?: string } | string>;
  body?: string;
}

function GitHubIssueCard({ issue }: { issue: GitHubIssue }) {
  const link = issue.html_url || issue.url;
  const user =
    typeof issue.user === "string"
      ? issue.user
      : issue.user?.login;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <div className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
        <div className="mt-0.5">
          <CircleDotIcon
            className={cn(
              "size-4",
              issue.state === "open"
                ? "text-green-500"
                : "text-purple-500",
            )}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium leading-snug">
              {issue.title}
            </span>
            {link && (
              <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {issue.number && <span>#{issue.number}</span>}
            {issue.state && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 font-medium",
                  issue.state === "open"
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-purple-500/15 text-purple-600 dark:text-purple-400",
                )}
              >
                {issue.state}
              </span>
            )}
            {user && (
              <span className="flex items-center gap-1">
                <UserIcon className="size-3" />
                {user}
              </span>
            )}
          </div>
          {issue.labels && issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {issue.labels.map((label) => {
                const name = typeof label === "string" ? label : label.name;
                return (
                  <span
                    key={name}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

function parseGitHubIssues(result: unknown): GitHubIssue[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.items)) return r.items as GitHubIssue[];
  if (Array.isArray(r.issues)) return r.issues as GitHubIssue[];
  if (typeof r.content === "string") {
    try {
      const parsed = JSON.parse(r.content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (r.title) return [r as unknown as GitHubIssue];
  return [];
}

export const GitHubIssuesToolUI = makeAssistantToolUI<
  { repo?: string; query?: string; owner?: string },
  unknown
>({
  toolName: "github__list_issues",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolLoading label={`Fetching GitHub issues${args.repo ? ` from ${args.repo}` : ""}…`} />;
    }

    const issues = parseGitHubIssues(result);

    if (issues.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No GitHub issues found.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <GitBranchIcon className="size-3.5" />
          {issues.length} GitHub issue{issues.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-col gap-1.5">
          {issues.map((issue, i) => (
            <GitHubIssueCard
              key={issue.number || i}
              issue={issue}
            />
          ))}
        </div>
      </div>
    );
  },
});
