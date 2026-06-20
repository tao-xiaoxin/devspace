import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { HostContext, ToolResultCard } from "./card-types.js";

interface PayloadRendererOptions {
  card: ToolResultCard;
  hostContext?: HostContext;
  errorMessage?: string | null;
  submitAnswers?: (input: {
    workspaceId: string;
    answers: Array<{ questionId: string; label: string }>;
  }) => Promise<void>;
}

interface MountedPayload {
  update(options: PayloadRendererOptions): void;
  unmount(): void;
}

export function mountUserInputPayload(
  container: HTMLElement,
  options: PayloadRendererOptions,
): MountedPayload {
  const root = createRoot(container);
  root.render(<UserInputPayload {...options} />);

  return {
    update(nextOptions) {
      root.render(<UserInputPayload {...nextOptions} />);
    },
    unmount() {
      root.unmount();
    },
  };
}

function UserInputPayload({
  card,
  errorMessage = null,
  submitAnswers,
}: PayloadRendererOptions) {
  const userInput = card.userInput;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  if (errorMessage) return <StatusLine message={errorMessage} tone="error" />;
  if (!userInput) return <StatusLine message="No user-input details available." />;

  const isPending = userInput.status === "pending";

  return (
    <div className="user-input-card">
      {(userInput.questions ?? []).map((question) => (
        <section className="user-input-question" key={question.id}>
          <div className="user-input-header">{question.header}</div>
          <div className="user-input-text">{question.question}</div>
          <div className="user-input-options">
            {(question.options ?? []).map((option) => {
              const isSelected = selected[question.id ?? ""] === option.label;
              return (
                <button
                  type="button"
                  className={`user-input-option ${isSelected ? "selected" : ""}`}
                  key={`${question.id}-${option.label}`}
                  disabled={!isPending || submitting}
                  onClick={() => {
                    if (!question.id || !option.label) return;
                    const questionId = question.id;
                    const label = option.label;
                    setSelected((current) => ({ ...current, [questionId]: label }));
                  }}
                >
                  <span className="user-input-option-label">{option.label}</span>
                  <span className="user-input-option-description">{option.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {userInput.response?.summary ? (
        <div className="user-input-summary">{userInput.response.summary}</div>
      ) : null}
      {submitError ? <StatusLine message={submitError} tone="error" /> : null}

      {isPending ? (
        <div className="user-input-actions">
          <button
            type="button"
            className="user-input-submit"
            disabled={submitting || !canSubmit(userInput.questions ?? [], selected)}
            onClick={async () => {
              try {
                setSubmitting(true);
                setSubmitError(null);
                const workspaceId = card.workspaceId;
                if (!workspaceId) throw new Error("Missing workspaceId for user-input submission.");

                const answers = (userInput.questions ?? []).map((question) => ({
                  questionId: question.id ?? "",
                  label: selected[question.id ?? ""],
                }));

                if (!submitAnswers) throw new Error("Host tool bridge is unavailable.");
                await submitAnswers({ workspaceId, answers });
              } catch (error) {
                setSubmitError(error instanceof Error ? error.message : String(error));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Submitting..." : "Submit answers"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function canSubmit(
  questions: Array<{ id?: string }>,
  selected: Record<string, string>,
): boolean {
  return questions.every((question) => {
    if (!question.id) return false;
    return typeof selected[question.id] === "string" && selected[question.id].length > 0;
  });
}

function StatusLine({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "muted" | "error";
}) {
  return <div className={`status ${tone}`}>{message}</div>;
}
