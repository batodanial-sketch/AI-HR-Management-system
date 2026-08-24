from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GeneratedQuestion:
    prompt: str
    choices: list[dict[str, str]]
    correct_answer: str
    explanation: str


def build_review_questions(learning_objectives: list[str]) -> list[GeneratedQuestion]:
    """Build deterministic review prompts from supplied objectives without claiming AI generation."""
    questions: list[GeneratedQuestion] = []
    for index, objective in enumerate(objective.strip() for objective in learning_objectives if objective.strip()):
        choices = [
            {"id": "a", "label": f"Apply the documented procedure for: {objective}"},
            {"id": "b", "label": "Ignore the documented procedure"},
            {"id": "c", "label": "Share protected information externally"},
            {"id": "d", "label": "Skip required review steps"},
        ]
        questions.append(GeneratedQuestion(prompt=f"Which action best supports this learning objective: {objective}?", choices=choices, correct_answer="a", explanation="The correct answer follows the stated learning objective and documented procedure."))
    return questions


def question_to_row(question: GeneratedQuestion, sort_order: int) -> dict[str, Any]:
    return {"prompt": question.prompt, "question_type": "multiple_choice", "choices": question.choices, "correct_answer": "a", "explanation": question.explanation, "sort_order": sort_order}
