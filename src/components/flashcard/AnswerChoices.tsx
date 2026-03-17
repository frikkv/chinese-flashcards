export function AnswerChoices({
  choices,
  choiceStates,
  answered,
  onChoose,
}: {
  choices: string[]
  choiceStates: Record<string, 'correct' | 'wrong'>
  answered: boolean
  onChoose: (choice: string) => void
}) {
  return (
    <div className="fc-choices">
      {choices.map((choice) => (
        <button
          key={choice}
          className={`fc-choice-btn${choiceStates[choice] ? ` ${choiceStates[choice]}` : ''}`}
          disabled={answered}
          onClick={() => onChoose(choice)}
        >
          {choice}
        </button>
      ))}
    </div>
  )
}
