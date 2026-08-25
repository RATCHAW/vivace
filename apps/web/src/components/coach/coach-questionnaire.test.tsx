import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { i18n } from "@/i18n";
import {
  asQuestionnaire,
  CoachQuestionnaire,
  CoachQuestionnaireStatus,
  type QuestionnaireCard,
} from "./coach-questionnaire";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

/** A question as `buildQuestionnaire` hands it over. */
function question(over: Partial<QuestionnaireCard["questions"][number]> = {}) {
  return {
    id: "q1",
    question: "Which race are you training for?",
    hint: null,
    kind: "single" as const,
    choices: [
      { value: "c1", label: "Half", hint: null },
      { value: "c2", label: "Marathon", hint: null },
    ],
    unit: null,
    placeholder: null,
    ...over,
  };
}

function card(
  questions: QuestionnaireCard["questions"],
  intro: string | null = null,
): QuestionnaireCard {
  return { card: "questionnaire", intro, questions };
}

describe("asQuestionnaire", () => {
  it("takes a questionnaire and nothing else", () => {
    expect(asQuestionnaire(card([question()]))).not.toBeNull();
    expect(asQuestionnaire({ card: "week-plan", sessions: [] })).toBeNull();
    expect(asQuestionnaire({ error: "no" })).toBeNull();
    expect(asQuestionnaire(null)).toBeNull();
  });

  it("refuses a questionnaire with no questions array to walk", () => {
    expect(asQuestionnaire({ card: "questionnaire", intro: null })).toBeNull();
  });
});

describe("CoachQuestionnaire", () => {
  it("sends the labels the coach wrote, not the form's own values", () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Marathon"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledWith(
      "Here are my answers:\nWhich race are you training for? — Marathon",
    );
  });

  it("says a skipped question was skipped rather than leaving a gap", async () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([
          question(),
          question({
            id: "q2",
            question: "Anything sore?",
            kind: "text",
            choices: [],
          }),
        ])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // Skipping the last question submits the form, which the component does on
    // a microtask so the skipped field is off the form before it is read.
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith(
        [
          "Here are my answers:",
          "Which race are you training for? — Half",
          "Anything sore? — skipped",
        ].join("\n"),
      ),
    );
  });

  it("carries the unit into a typed number, so 4 is not just 4", () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([
          question({
            question: "How often do you run?",
            kind: "number",
            choices: [],
            unit: "days a week",
          }),
        ])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledWith(
      "Here are my answers:\nHow often do you run? — 4 days a week",
    );
  });

  it("answers once — a second submit would write the context twice", () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);

    expect(onAnswer).toHaveBeenCalledOnce();
  });

  it("takes an answer the coach never offered, over the ones it did", () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.change(screen.getByPlaceholderText("Something else…"), {
      target: { value: "A 50k on trail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Typing replaced the tapped option rather than joining it: one question,
    // one answer.
    expect(onAnswer).toHaveBeenCalledWith(
      "Here are my answers:\nWhich race are you training for? — A 50k on trail",
    );
  });

  it("adds to the ticked boxes on a multi, rather than replacing them", () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([
          question({ kind: "multi", question: "Which days can you run?" }),
        ])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.change(screen.getByPlaceholderText("Something else…"), {
      target: { value: "Sundays only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledWith(
      "Here are my answers:\nWhich days can you run? — Half, Sundays only",
    );
  });

  it("never traps the athlete on a question", () => {
    render(
      <CoachQuestionnaire
        card={card([question(), question({ id: "q2" })], "Two quick things.")}
        onAnswer={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // Three ways out, each answering a different question. Skip and the
    // free-text box are ways past the questions; the third is the way past the
    // form itself, for when they were the wrong questions to begin with.
    expect(screen.getByRole("button", { name: "Skip" })).toBeDefined();
    expect(screen.getAllByPlaceholderText("Something else…")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Dismiss these questions" }),
    ).toBeDefined();
  });

  it("hands the composer back without answering anything", () => {
    const onAnswer = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={onAnswer}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss these questions" }),
    );

    expect(onDismiss).toHaveBeenCalledOnce();
    // Nothing typed on the way out is sent on the way out — dismissing is the
    // athlete saying the form was beside the point, not a half-filled answer.
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("leaves on Escape, as every other takeover in the app does", () => {
    const onDismiss = vi.fn();
    render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText("Something else…"), {
      key: "Escape",
    });

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("dismisses rather than submits — the X sits inside the form", () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <CoachQuestionnaire
        card={card([question()])}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    );

    // A button with no type inside a `<form>` is a submit button, which would
    // send the answers it was pressed to escape.
    const dismiss = screen.getByRole("button", {
      name: "Dismiss these questions",
    });
    expect(dismiss.getAttribute("type")).toBe("button");
    expect(container.querySelector("form")).not.toBeNull();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("draws its own chrome in French", async () => {
    await i18n.changeLanguage("fr");
    render(
      <CoachQuestionnaire
        card={card([question(), question({ id: "q2" })])}
        onAnswer={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Passer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeDefined();
    expect(screen.getByText("1 sur 2")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Écarter ces questions" }),
    ).toBeDefined();
  });
});

describe("CoachQuestionnaireStatus", () => {
  it("says which of the three states it is in", () => {
    const { rerender } = render(<CoachQuestionnaireStatus status="awaiting" />);
    expect(screen.getByText("Awaiting your answer")).toBeDefined();

    rerender(<CoachQuestionnaireStatus status="answered" />);
    expect(screen.getByText("Answered")).toBeDefined();
    // A line in the transcript, not a control: the questions live in the
    // composer, and there is nothing here to press.
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<CoachQuestionnaireStatus status="dismissed" />);
    expect(screen.getByText("Dismissed")).toBeDefined();
  });

  it("offers the way back only while there is one", () => {
    const onRestore = vi.fn();
    const { rerender } = render(
      <CoachQuestionnaireStatus onRestore={onRestore} status="dismissed" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(onRestore).toHaveBeenCalledOnce();

    // Once the conversation has moved past the ask, reopening it would put
    // questions the athlete has already answered in prose back on screen.
    rerender(<CoachQuestionnaireStatus status="dismissed" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
