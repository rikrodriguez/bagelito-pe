export type DawnConversationKind =
  | "simple"
  | "sales"
  | "order_summary"
  | "operations"
  | "recovery";

export type DawnStyleIssueCode =
  | "empty_reply"
  | "too_many_bubbles"
  | "bubble_too_long"
  | "line_too_long"
  | "block_too_long"
  | "wall_of_text"
  | "pipe_separator"
  | "excessive_emojis"
  | "support_bot_language"
  | "missing_order_total"
  | "compressed_order_items";

export type DawnStyleIssue = {
  code: DawnStyleIssueCode;
  penalty: number;
  message: string;
};

export type DawnStyleScore = {
  score: number;
  pass: boolean;
  issues: DawnStyleIssue[];
  metrics: {
    bubbles: number;
    characters: number;
    longestBubble: number;
    longestLine: number;
    longestBlock: number;
    emojis: number;
  };
};

export const DAWN_VOICE_PROFILE = {
  version: "dawn-instagram-2026-11-03-v1",
  source: "Bagelito Instagram export plus live operator replies",
  observed: {
    conversationFiles: 537,
    totalMessages: 8787,
    dawnMessages: 3994,
    textMessages: 3385,
    mediaMessages: 332,
    medianCharacters: 68,
    seventyFifthPercentileCharacters: 106,
    multilinePercent: 20.6,
    blankLinePercent: 19.9,
    messagesWithEmojiPercent: 33,
    longMessageMultilinePercent: 90.2,
    longMessageBlankLinePercent: 88.6,
    rapidMultiBubbleSequences: 762,
  },
  layout: {
    maximumBubbles: 2,
    maximumBubbleCharacters: 450,
    maximumLineCharacters: 155,
    maximumBlockCharacters: 180,
    wallOfTextCharacters: 180,
  },
  emoji: {
    preferredPerReply: [0, 2],
    maximumPerReply: 5,
    functionalAnchors: ["🥯", "🧀", "📍", "📱", "🛵", "😊"],
  },
  language: {
    preferredPerson: "first-person-singular",
    naturalOpeners: ["Holaaa", "Hola", "Perfecto", "Siii", "Amazing", "Awesome"],
    naturalNextSteps: [
      "me avisas",
      "te aviso",
      "solo necesito",
      "te confirmo",
      "mándame la captura",
    ],
    forbiddenSupportPhrases: [
      "estimado cliente",
      "estimada cliente",
      "hemos recibido tu solicitud",
      "te guiaremos",
      "siguientes pasos",
      "podemos ayudarte con",
      "proceder con tu solicitud",
    ],
  },
} as const;

const EMOJI_PATTERN = /[\u{1F1E6}-\u{1FAFF}\u2600-\u27BF]/gu;

function addIssue(
  issues: DawnStyleIssue[],
  code: DawnStyleIssueCode,
  penalty: number,
  message: string,
) {
  issues.push({ code, penalty, message });
}

function normalizeMessages(reply: string | string[]) {
  const messages = (Array.isArray(reply) ? reply : [reply])
    .map((message) => message.replace(/\r\n?/g, "\n").trim())
    .filter(Boolean);

  return messages;
}

function countEmojis(value: string) {
  return value.match(EMOJI_PATTERN)?.length ?? 0;
}

function getBlocks(value: string) {
  return value.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
}

function hasSupportBotLanguage(value: string) {
  const normalized = value.toLocaleLowerCase("es");
  return DAWN_VOICE_PROFILE.language.forbiddenSupportPhrases.some((phrase) =>
    normalized.includes(phrase),
  );
}

function looksLikeCompressedOrderItems(value: string) {
  const productMentions = (value.match(/\b(plain|cheddar|blueberry|sesame|everything|onion|bagel|schmear)\b/gi) ?? []).length;
  return productMentions >= 3 && !value.includes("\n");
}

export function scoreDawnStyle(
  reply: string | string[],
  options: { kind?: DawnConversationKind } = {},
): DawnStyleScore {
  const messages = normalizeMessages(reply);
  const issues: DawnStyleIssue[] = [];
  const combined = messages.join("\n\n");
  const lines = messages.flatMap((message) => message.split("\n"));
  const blocks = messages.flatMap(getBlocks);
  const emojis = countEmojis(combined);

  if (messages.length === 0) {
    addIssue(issues, "empty_reply", 100, "The reply is empty.");
  }

  if (messages.length > DAWN_VOICE_PROFILE.layout.maximumBubbles) {
    addIssue(
      issues,
      "too_many_bubbles",
      20,
      `Dawn-style replies use at most ${DAWN_VOICE_PROFILE.layout.maximumBubbles} text bubbles.`,
    );
  }

  for (const message of messages) {
    if ([...message].length > DAWN_VOICE_PROFILE.layout.maximumBubbleCharacters) {
      addIssue(
        issues,
        "bubble_too_long",
        20,
        `A text bubble exceeds ${DAWN_VOICE_PROFILE.layout.maximumBubbleCharacters} characters.`,
      );
    }

    if (
      [...message].length > DAWN_VOICE_PROFILE.layout.wallOfTextCharacters &&
      !message.includes("\n\n")
    ) {
      addIssue(
        issues,
        "wall_of_text",
        30,
        "A long reply is compressed into one paragraph instead of using breathing room.",
      );
    }
  }

  if (lines.some((line) => [...line].length > DAWN_VOICE_PROFILE.layout.maximumLineCharacters)) {
    addIssue(
      issues,
      "line_too_long",
      15,
      `At least one line exceeds ${DAWN_VOICE_PROFILE.layout.maximumLineCharacters} characters.`,
    );
  }

  if (blocks.some((block) => [...block].length > DAWN_VOICE_PROFILE.layout.maximumBlockCharacters)) {
    addIssue(
      issues,
      "block_too_long",
      10,
      `At least one paragraph or list block exceeds ${DAWN_VOICE_PROFILE.layout.maximumBlockCharacters} characters.`,
    );
  }

  if (combined.includes("|")) {
    addIssue(
      issues,
      "pipe_separator",
      25,
      "Pack or price options must be stacked vertically rather than separated with a pipe.",
    );
  }

  if (emojis > DAWN_VOICE_PROFILE.emoji.maximumPerReply) {
    addIssue(
      issues,
      "excessive_emojis",
      25,
      "Emojis should act as light visual anchors, not decoration on every phrase.",
    );
  }

  if (hasSupportBotLanguage(combined)) {
    addIssue(
      issues,
      "support_bot_language",
      30,
      "The wording sounds like a support bot rather than Dawn speaking personally.",
    );
  }

  if (options.kind === "order_summary") {
    if (!/(^|\n)\s*total\s*:/im.test(combined)) {
      addIssue(
        issues,
        "missing_order_total",
        20,
        "An order summary must show the total as a distinct line or block.",
      );
    }

    if (looksLikeCompressedOrderItems(combined)) {
      addIssue(
        issues,
        "compressed_order_items",
        20,
        "Order items should be displayed one per line for mobile scanning.",
      );
    }
  }

  const score = Math.max(
    0,
    100 - issues.reduce((total, issue) => total + issue.penalty, 0),
  );

  return {
    score,
    pass: score >= 80 && issues.every((issue) => issue.penalty < 30),
    issues,
    metrics: {
      bubbles: messages.length,
      characters: [...combined].length,
      longestBubble: Math.max(0, ...messages.map((message) => [...message].length)),
      longestLine: Math.max(0, ...lines.map((line) => [...line].length)),
      longestBlock: Math.max(0, ...blocks.map((block) => [...block].length)),
      emojis,
    },
  };
}
