"use client";

import { useState } from "react";

type ShadowSuggestion = {
  intent: string;
  language: string;
  confidence: number;
  proposedReply: string;
  proposedMediaTags: string[];
  risk: "auto" | "review" | "human";
};

type ShadowResponse =
  | {
      ok: true;
      shadowMode: true;
      suggestion: ShadowSuggestion;
      liveContextWarnings: string[];
    }
  | {
      ok: false;
      error: string;
      shadowMode?: boolean;
    };

function riskLabel(risk: ShadowSuggestion["risk"]) {
  if (risk === "human") return "Human";
  if (risk === "review") return "Review";
  return "Auto-eligible later";
}

export function InstagramShadowDraftButton({
  conversationId,
}: {
  conversationId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShadowSuggestion | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/instagram/shadow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      const payload = (await response.json()) as ShadowResponse;

      if (!response.ok || !payload.ok) {
        setResult(null);
        setWarnings([]);
        setError(
          payload.error === "instagram_ai_not_configured"
            ? "AI model is not configured in this environment yet."
            : payload.error || "Could not generate a shadow draft.",
        );
        return;
      }

      setResult(payload.suggestion);
      setWarnings(payload.liveContextWarnings ?? []);
    } catch {
      setResult(null);
      setWarnings([]);
      setError("Could not generate a shadow draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-safety-card">
      <div>
        <span>Shadow suggestion</span>
        <strong>No message will be sent.</strong>
        <p>Generate an internal Bagelito-style draft using recent messages plus current live facts.</p>

        <button
          className="pill-button mint"
          disabled={loading}
          onClick={generateDraft}
          type="button"
        >
          {loading ? "Generating…" : result ? "Regenerate shadow draft" : "Generate shadow draft"}
        </button>

        {error ? <p>{error}</p> : null}

        {result ? (
          <div className="customer-crm-highlight">
            <span>
              {riskLabel(result.risk)} · {result.intent} · {result.language.toUpperCase()} ·{" "}
              {Math.round(result.confidence * 100)}%
            </span>
            <strong>{result.proposedReply}</strong>
            <small>
              {result.proposedMediaTags.length
                ? `Suggested media tags: ${result.proposedMediaTags.join(", ")}. `
                : ""}
              Draft only — sending is disabled.
            </small>
          </div>
        ) : null}

        {warnings.length ? (
          <small>Live context warnings: {warnings.join(", ")}</small>
        ) : null}
      </div>
    </div>
  );
}
