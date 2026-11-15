// Written with AI assistance (Claude Code)
// A link label that rolls like a small box on hover or keyboard focus: the word turns up and away and
// its twin, in the hover ink, lands facing you. Same size before and after, so nothing around it moves.
// Reduced motion or Pause: no roll, only the colour change the link already has.
import "./nav-roll.css";

export function RollLabel({ text }: { text: string }) {
  return (
    <span className="roll">
      <span className="roll-box">
        <span className="roll-face">{text}</span>
        <span className="roll-face roll-twin" aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}
