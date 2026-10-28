import {
  bagelitoConversationGuardrails,
  getIntentRisk,
  instagramIntentRisk,
  type InstagramIntent,
  type InstagramLanguage,
} from "@/lib/instagram/policy";
import type { InstagramLiveContext } from "@/lib/instagram/live-context";

export type InstagramShadowMessage = {
  direction: "inbound" | "outbound";
  text: string | null;
  sentAt: string;
  hasAttachments?: boolean;
};

export type InstagramShadowInput = {
  customerName?: string | null;
  conversationLanguage: InstagramLanguage;
  recentMessages: InstagramShadowMessage[];
  liveContext: InstagramLiveContext;
};

export type InstagramShadowSuggestion = {
  intent: InstagramIntent;
  language: InstagramLanguage;
  confidence: number;
  proposedReply: string;
  proposedMediaTags: string[];
  risk: "auto" | "review" | "human";
  model: string;
};

type RawResponsesPayload = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

const intentValues = Object.keys(instagramIntentRisk) as InstagramIntent[];
const languageValues: InstagramLanguage[] = ["es", "en", "mixed", "unknown"];

function extractResponseText(payload: RawResponsesPayload): string {
  const pieces: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        pieces.push(content.text);
      }
    }
  }

  return pieces.join("\n").trim();
}

function isIntent(value: unknown): value is InstagramIntent {
  return typeof value === "string" && intentValues.includes(value as InstagramIntent);
}

function isLanguage(value: unknown): value is InstagramLanguage {
  return typeof value === "string" && languageValues.includes(value as InstagramLanguage);
}

function parseSuggestion(value: string) {
  const parsed = JSON.parse(value) as Record<string, unknown>;

  if (!isIntent(parsed.intent)) throw new Error("instagram_ai_invalid_intent");
  if (!isLanguage(parsed.language)) throw new Error("instagram_ai_invalid_language");
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error("instagram_ai_invalid_confidence");
  }
  if (typeof parsed.proposed_reply !== "string") {
    throw new Error("instagram_ai_invalid_reply");
  }
  if (!Array.isArray(parsed.proposed_media_tags) || !parsed.proposed_media_tags.every((item) => typeof item === "string")) {
    throw new Error("instagram_ai_invalid_media_tags");
  }

  return {
    intent: parsed.intent,
    language: parsed.language,
    confidence: parsed.confidence,
    proposedReply: parsed.proposed_reply.trim(),
    proposedMediaTags: parsed.proposed_media_tags.slice(0, 5),
  };
}

function buildInstructions() {
  return [
    "You are the Shadow Mode Instagram assistant for Bagelito, a small bagel brand in Lima.",
    "Your output is an internal draft for a human operator. Never claim that you sent a message or took an external action.",
    "Conversation style is learned from Dawn @ Bagelito's historical Instagram behavior; operational facts must come ONLY from LIVE_FACTS.",
    "Voice: warm, personal, natural, concise, lightly enthusiastic. Spanish and English are native voices, not literal translations.",
    "A simple operational question gets a simple answer, EXCEPT flavors/menu/how-to-order intents: historical and live Bagelito handling treats these as sales moments and usually gives a compact full sales answer.",
    "For flavors/menu/how-to-order, when LIVE_FACTS supports it, structure the answer as: warm greeting -> active promo if explicitly current -> regular flavors/products -> relevant packs/prices -> schmears/add-ons -> current production/delivery timing -> what information is needed to order -> approved Bagelito photos.",
    "For that commercial exception, reduce back-and-forth without becoming pushy. Never invent or reuse stale promo, price, date, delivery, or availability facts.",
    "Use emojis naturally but not mechanically. Do not imitate typos on purpose.",
    "Acknowledge meaningful customer context before logistics when natural.",
    "Do not reopen a sale after a natural thank-you/close.",
    "Never invent a price, promo, flavor availability, batch date, delivery fee, payment state, address, product, or exception.",
    "A configured seasonal flavor in LIVE_FACTS does not by itself prove current stock or availability; ask or route for review when availability is not explicit.",
    "If live facts are insufficient, ask a concise follow-up or draft a cautious answer rather than guessing.",
    "Do not promise discounts, refunds, custom production, delivery exceptions, or compensation.",
    "Food allergy, celiac/gluten safety, complaint, refund, missing/damaged order, payment dispute, and fraud must be classified into their matching human intent.",
    "Use ingredient_question or vegan_request for ordinary ingredient/vegan questions that need review. Use food_safety or allergy when cross-contact, celiac disease, allergy, or safety is involved.",
    "Media tags are internal search hints only. Never fabricate media URLs.",
    ...bagelitoConversationGuardrails.always,
    ...bagelitoConversationGuardrails.never,
    "Return JSON only and conform exactly to the supplied JSON schema.",
  ].join("\n");
}

export async function generateInstagramShadowSuggestion(
  input: InstagramShadowInput,
): Promise<InstagramShadowSuggestion> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.INSTAGRAM_AI_MODEL?.trim() || "gpt-6-astra";

  if (!apiKey) throw new Error("instagram_ai_not_configured");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: buildInstructions(),
      input: JSON.stringify(
        {
          CUSTOMER_NAME: input.customerName ?? null,
          CONVERSATION_LANGUAGE: input.conversationLanguage,
          RECENT_MESSAGES: input.recentMessages,
          LIVE_FACTS: input.liveContext,
        },
        null,
        2,
      ),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "bagelito_instagram_shadow",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", enum: intentValues },
              language: { type: "string", enum: languageValues },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              proposed_reply: { type: "string" },
              proposed_media_tags: {
                type: "array",
                maxItems: 5,
                items: { type: "string" },
              },
            },
            required: [
              "intent",
              "language",
              "confidence",
              "proposed_reply",
              "proposed_media_tags",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`instagram_ai_request_failed:${response.status}:${errorText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as RawResponsesPayload;
  const outputText = extractResponseText(payload);
  if (!outputText) throw new Error("instagram_ai_empty_response");

  const parsed = parseSuggestion(outputText);

  return {
    ...parsed,
    risk: getIntentRisk(parsed.intent),
    model,
  };
}
