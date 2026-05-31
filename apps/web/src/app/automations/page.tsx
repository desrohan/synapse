"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  PlusIcon,
  ZapIcon,
  Trash2Icon,
  Loader2Icon,
  ChevronDownIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

const TRIGGER_TYPES = [
  { value: "slack_message", label: "Slack Message", description: "When a message is posted in Slack" },
  { value: "mention", label: "Mention", description: "When you are mentioned" },
  { value: "jira_update", label: "Jira Update", description: "When a Jira ticket changes" },
  { value: "github_event", label: "GitHub Event", description: "When a PR or issue is updated" },
  { value: "schedule", label: "On Schedule", description: "At a specific time" },
] as const;

const ACTION_TYPES = [
  { value: "notify_slack", label: "Send Slack notification" },
  { value: "create_todo", label: "Create a to-do" },
  { value: "generate_report", label: "Generate a report" },
  { value: "send_email", label: "Send email digest" },
] as const;

interface Automation {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: string;
  condition_nlp: string | null;
  condition_parsed: any;
  actions: any[];
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

export default function AutomationsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  const fetchAutomations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/automations?userId=${userId}`
      );
      const data = await res.json();
      setAutomations(data.automations || []);
    } catch (err) {
      console.error("Failed to fetch automations:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const toggleAutomation = async (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
    await fetch(`${BACKEND_URL}/api/automations/${id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  };

  const deleteAutomation = async (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    await fetch(`${BACKEND_URL}/api/automations/${id}?userId=${userId}`, {
      method: "DELETE",
    });
  };

  if (!userId) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-muted-foreground">
        Please sign in to manage automations.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">
            Automations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define rules in natural language. Synapse executes them automatically.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <PlusIcon className="size-4" />
          New Automation
        </button>
      </div>

      {showCreate && (
        <CreateAutomationForm
          userId={userId}
          onCreated={() => {
            setShowCreate(false);
            fetchAutomations();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {automations.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <ZapIcon className="mx-auto mb-3 size-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            No automations yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create your first automation to let Synapse work for you in the
            background.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                automation.enabled
                  ? "border-border/50 bg-card/50"
                  : "border-border/30 bg-muted/20 opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ZapIcon
                      className={cn(
                        "size-3.5",
                        automation.enabled
                          ? "text-amber-500"
                          : "text-muted-foreground"
                      )}
                    />
                    <h3 className="text-sm font-medium">{automation.name}</h3>
                  </div>
                  {automation.condition_nlp && (
                    <p className="mt-1.5 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground italic">
                      &ldquo;{automation.condition_nlp}&rdquo;
                    </p>
                  )}
                  {automation.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {automation.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/60">
                    <span className="uppercase tracking-wider">
                      {automation.trigger_type.replace("_", " ")}
                    </span>
                    {automation.trigger_count > 0 && (
                      <span>Triggered {automation.trigger_count}×</span>
                    )}
                    {automation.actions.length > 0 && (
                      <span>
                        {automation.actions.length} action
                        {automation.actions.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleAutomation(automation.id)}
                    className="rounded p-1.5 transition-colors hover:bg-accent"
                    title={automation.enabled ? "Disable" : "Enable"}
                  >
                    {automation.enabled ? (
                      <ToggleRightIcon className="size-4 text-primary" />
                    ) : (
                      <ToggleLeftIcon className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteAutomation(automation.id)}
                    className="rounded p-1.5 transition-colors hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2Icon className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAutomationForm({
  userId,
  onCreated,
  onCancel,
}: {
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("slack_message");
  const [conditionNlp, setConditionNlp] = useState("");
  const [actions, setActions] = useState<string[]>(["create_todo"]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !conditionNlp.trim()) return;

    setSaving(true);
    try {
      await fetch(`${BACKEND_URL}/api/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: name.trim(),
          trigger_type: triggerType,
          condition_nlp: conditionNlp.trim(),
          actions: actions.map((a) => ({ type: a, params: {} })),
        }),
      });
      onCreated();
    } catch (err) {
      console.error("Failed to create automation:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border bg-card/50 p-5"
    >
      <h3 className="mb-4 font-serif text-sm font-semibold">
        New Automation
      </h3>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Blocker Alert"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Trigger */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Trigger
          </label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            {TRIGGER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
        </div>

        {/* Condition (NLP) */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Condition (describe in plain English)
          </label>
          <textarea
            value={conditionNlp}
            onChange={(e) => setConditionNlp(e.target.value)}
            placeholder='e.g. "When someone mentions a blocker or urgent issue in #dev-team"'
            rows={3}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            Synapse will use AI to parse this into a structured condition.
          </p>
        </div>

        {/* Actions */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Then do...
          </label>
          <div className="space-y-2">
            {actions.map((action, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={action}
                  onChange={(e) => {
                    const copy = [...actions];
                    copy[i] = e.target.value;
                    setActions(copy);
                  }}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none"
                >
                  {ACTION_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                {actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setActions(actions.filter((_, idx) => idx !== i))
                    }
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setActions([...actions, "create_todo"])}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <PlusIcon className="size-3" /> Add action
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !conditionNlp.trim()}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2Icon className="size-3 animate-spin" />}
          Create Automation
        </button>
      </div>
    </form>
  );
}
