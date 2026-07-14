import React from 'react';

const rows = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BACKSPACE'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'ENTER'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'CLEAR'],
  ['SPACE'],
];

const labels = {BACKSPACE: '←', ENTER: '↵', CLEAR: 'CLEAR', SPACE: 'SPACE'};

const OnScreenKeyboard = ({disabled = false, onKey}) => (
  <div className="terminal-keyboard" aria-label="On-screen keyboard">
    {rows.map((row, rowIndex) => (
      <div className="terminal-keyboard-row" key={rowIndex}>
        {row.map((key) => (
          <button
            className={`terminal-key key-${key.toLowerCase()}`}
            disabled={disabled}
            key={key}
            onClick={() => onKey(key)}
            type="button"
          >
            {labels[key] ?? key}
          </button>
        ))}
      </div>
    ))}
  </div>
);

export default OnScreenKeyboard;
