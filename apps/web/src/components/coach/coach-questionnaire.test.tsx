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
      <CoachQuestionnaire card={card([question()])} onAnswer={onAnswer} />,
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
      <CoachQuestionnaire card={card([question()])} onAnswer={onAnswer} />,
    );

    fireEvent.click(screen.getByText("Half"));
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);

    expect(onAnswer).toHaveBeenCalledOnce();
  });

  it("takes an answer the coach never offered, over the ones it did", () => {
    const onAnswer = vi.fn();
    render(
      <CoachQuestionnaire card={card([question()])} onAnswer={onAnswer} />,
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
      />,
    );

    // Skip on every question and a free-text box on every choice question are
    // the two ways past a form that stands where the composer does. There is
    // no dismiss, because neither of those can run out.
    expect(screen.getByRole("button", { name: "Skip" })).toBeDefined();
    expect(screen.getAllByPlaceholderText("Something else…")).toHaveLength(2);
  });

  it("draws its own chrome in French", async () => {
    await i18n.changeLanguage("fr");
    render(
      <CoachQuestionnaire
        card={card([question(), question({ id: "q2" })])}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Passer" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeDefined();
    expect(screen.getByText("1 sur 2")).toBeDefined();
  });
});

describe("CoachQuestionnaireStatus", () => {
  it("says which of the two states it is in, and nothing else", () => {
    const { rerender } = render(<CoachQuestionnaireStatus answered={false} />);
    expect(screen.getByText("Awaiting your answer")).toBeDefined();

    rerender(<CoachQuestionnaireStatus answered />);
    expect(screen.getByText("Answered")).toBeDefined();
    // A line in the transcript, not a control: the questions live in the
    // composer, and there is nothing here to press.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
