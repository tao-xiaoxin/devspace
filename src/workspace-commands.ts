import type {
  WorkspaceUserInputAnswer,
  WorkspaceUserInputRecord,
} from "./workspace-store.js";

export type WorkspaceCommandKind = "plan" | "goal" | "answer" | "none";

export interface ParsedWorkspaceCommand {
  kind: WorkspaceCommandKind;
  recognized: boolean;
  argument?: string;
  answers?: WorkspaceUserInputAnswer[];
  error?: string;
}

export function normalizeWorkspaceCommandMessage(message: string): string {
  return message.trim().replace(/^@\S+\s+/, "").trim();
}

export function parseWorkspaceCommand(
  message: string,
  pending?: WorkspaceUserInputRecord,
): ParsedWorkspaceCommand {
  const normalized = normalizeWorkspaceCommandMessage(message);

  const planMatch = normalized.match(/^\/plan(?:\s+([\s\S]+))?$/i);
  if (planMatch) {
    return {
      kind: "plan",
      recognized: true,
      argument: planMatch[1]?.trim() || undefined,
    };
  }

  const goalMatch = normalized.match(/^\/goal(?:\s+([\s\S]+))?$/i);
  if (goalMatch) {
    return {
      kind: "goal",
      recognized: true,
      argument: goalMatch[1]?.trim() || undefined,
    };
  }

  if (pending) {
    const parsedAnswers = parseCompactAnswerText(pending, normalized);
    if (parsedAnswers.matched) {
      return {
        kind: "answer",
        recognized: true,
        answers: parsedAnswers.answers,
        error: parsedAnswers.error,
      };
    }
  }

  return { kind: "none", recognized: false };
}

export function parseAnswerTextOrThrow(
  pending: WorkspaceUserInputRecord,
  text: string,
): WorkspaceUserInputAnswer[] {
  const parsed = parseCompactAnswerText(pending, text);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (!parsed.matched || !parsed.answers) {
    throw new Error("Could not parse the reply as answers for the pending questions.");
  }

  return parsed.answers;
}

export function parseCompactAnswerText(
  pending: WorkspaceUserInputRecord,
  text: string,
): {
  matched: boolean;
  answers?: WorkspaceUserInputAnswer[];
  error?: string;
} {
  const normalized = normalizeWorkspaceCommandMessage(text).replace(/[，、；]/g, ",");
  if (!/\d/.test(normalized)) return { matched: false };

  const tokens = normalized.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { matched: false };

  const parsed = tokens.map((token) => token.match(/^(\d+)([A-Za-z])$/));
  if (parsed.some((match) => !match)) return { matched: false };

  const seen = new Set<number>();
  const answerMap = new Map<string, string>();

  for (const match of parsed) {
    if (!match) continue;
    const questionNumber = Number(match[1]);
    const optionLetter = match[2]?.toUpperCase() ?? "";
    const question = pending.questions[questionNumber - 1];
    if (!question) {
      return { matched: true, error: `Question ${questionNumber} does not exist.` };
    }
    if (seen.has(questionNumber)) {
      return { matched: true, error: `Question ${questionNumber} was answered more than once.` };
    }

    const optionIndex = optionLetter.charCodeAt(0) - 65;
    const option = question.options[optionIndex];
    if (!option) {
      return {
        matched: true,
        error: `Option ${optionLetter} is invalid for question ${questionNumber}.`,
      };
    }

    seen.add(questionNumber);
    answerMap.set(question.id, option.label);
  }

  if (seen.size !== pending.questions.length) {
    const missing = pending.questions
      .map((_, index) => index + 1)
      .filter((index) => !seen.has(index));
    return {
      matched: true,
      error: `Missing answers for question ${missing.join(", ")}.`,
    };
  }

  return {
    matched: true,
    answers: pending.questions.map((question) => ({
      questionId: question.id,
      label: answerMap.get(question.id) ?? "",
    })),
  };
}
