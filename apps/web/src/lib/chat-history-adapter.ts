const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";

export function createSupabaseHistoryAdapter(
  threadId: string,
  userId: string
): any {
  const baseUrl = `${BACKEND_URL}/api/chat/history/threads/${threadId}`;

  return {
    async load() {
      try {
        const res = await fetch(`${baseUrl}?userId=${userId}`);
        if (!res.ok) return { headId: null, messages: [] };
        const data = await res.json();
        if (!data.messages?.length) return { headId: null, messages: [] };

        return {
          headId: data.head_id,
          messages: data.messages.map((m: any) => ({
            message: m,
            parentId: m.parent_id ?? null,
          })),
        };
      } catch {
        return { headId: null, messages: [] };
      }
    },

    async append(item) {
      try {
        await fetch(`${baseUrl}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            id: item.message?.id || crypto.randomUUID(),
            parentId: item.parentId,
            format: "exported",
            content: item.message,
            headId: item.message?.id,
          }),
        });
      } catch (err) {
        console.error("Failed to save message:", err);
      }
    },

    withFormat(formatAdapter) {
      return {
        async load() {
          try {
            const res = await fetch(`${baseUrl}?userId=${userId}`);
            if (!res.ok) return { headId: null, messages: [] };
            const data = await res.json();
            if (!data.messages?.length) return { headId: null, messages: [] };

            const messages = data.messages.map((stored: any) =>
              formatAdapter.decode({
                id: stored.id,
                parent_id: stored.parent_id,
                format: stored.format,
                content: stored.content,
              })
            );

            return { headId: data.head_id, messages };
          } catch {
            return { headId: null, messages: [] };
          }
        },

        async append(item) {
          try {
            const encoded = formatAdapter.encode(item);
            const id = formatAdapter.getId(item.message);
            await fetch(`${baseUrl}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                id,
                parentId: item.parentId,
                format: formatAdapter.format,
                content: encoded,
                headId: id,
              }),
            });
          } catch (err) {
            console.error("Failed to save message:", err);
          }
        },

        async update(item, localMessageId) {
          try {
            const encoded = formatAdapter.encode(item);
            const id = formatAdapter.getId(item.message);
            await fetch(`${baseUrl}/messages/${localMessageId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                id,
                parentId: item.parentId,
                format: formatAdapter.format,
                content: encoded,
                headId: id,
              }),
            });
          } catch (err) {
            console.error("Failed to update message:", err);
          }
        },
      };
    },
  };
}
