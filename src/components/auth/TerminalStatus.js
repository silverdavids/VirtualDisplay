import React from 'react';
import {getTerminalSession, logoutTerminal} from '../../auth/terminalAuth';

const TerminalStatus = ({onLogout}) => {
  const terminal = getTerminalSession()?.terminal;
  return (
    <div className="terminal-auth-status">
      <span className="terminal-auth-dot" aria-hidden="true" />
      <span className="terminal-auth-identity">
        <strong>{terminal?.code || 'Terminal'}</strong>
        {terminal?.name && <small>{terminal.name}</small>}
      </span>
      <button onClick={() => { logoutTerminal(); onLogout(); }} type="button">Logout</button>
    </div>
  );
};

export default TerminalStatus;
