import React, {useRef, useState} from 'react';
import {FaEye, FaEyeSlash, FaKey, FaLock, FaTv} from 'react-icons/fa';
import {loginTerminal} from '../../auth/terminalAuth';
import OnScreenKeyboard from './OnScreenKeyboard';
import './TerminalLogin.css';

const TerminalLogin = ({onAuthenticated}) => {
  const [terminalCode, setTerminalCode] = useState(process.env.REACT_APP_TERMINAL_CODE || '');
  const [terminalSecret, setTerminalSecret] = useState('');
  const [activeField, setActiveField] = useState('terminalCode');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const codeRef = useRef(null);
  const secretRef = useRef(null);

  const submit = async (event) => {
    event?.preventDefault();
    if (submitting) return;
    if (!terminalCode.trim() || !terminalSecret) {
      setError('Enter both the terminal code and activation key.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const session = await loginTerminal(terminalCode, terminalSecret);
      onAuthenticated(session);
    } catch (loginError) {
      setError(loginError.message || 'Unable to authenticate this terminal.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateActiveValue = (update) => {
    if (activeField === 'terminalSecret') setTerminalSecret(update(terminalSecret));
    else setTerminalCode(update(terminalCode));
  };

  const handleKeyboardKey = (key) => {
    if (key === 'ENTER') return submit();
    if (key === 'BACKSPACE') updateActiveValue((value) => value.slice(0, -1));
    else if (key === 'CLEAR') updateActiveValue(() => '');
    else updateActiveValue((value) => `${value}${key === 'SPACE' ? ' ' : key}`);
    requestAnimationFrame(() => (activeField === 'terminalSecret' ? secretRef : codeRef).current?.focus());
  };

  return (
    <main className="terminal-login-page">
      <section className="terminal-login-shell" aria-labelledby="terminal-login-title">
        <header className="terminal-login-header">
          <FaKey aria-hidden="true" />
          <h1 id="terminal-login-title">AUTHENTICATION</h1>
        </header>
        <form className="terminal-login-form" onSubmit={submit}>
          <label className="terminal-field">
            <span className="sr-only">Terminal Code</span>
            <FaTv aria-hidden="true" />
            <input
              autoComplete="username"
              autoFocus
              disabled={submitting}
              onChange={(event) => setTerminalCode(event.target.value.toUpperCase())}
              onFocus={() => setActiveField('terminalCode')}
              placeholder="TERMINAL CODE"
              ref={codeRef}
              value={terminalCode}
            />
          </label>
          <label className="terminal-field terminal-secret-field">
            <span className="sr-only">Activation Key</span>
            <FaLock aria-hidden="true" />
            <input
              autoComplete="current-password"
              disabled={submitting}
              onChange={(event) => setTerminalSecret(event.target.value)}
              onFocus={() => setActiveField('terminalSecret')}
              placeholder="ACTIVATION KEY"
              ref={secretRef}
              type={showSecret ? 'text' : 'password'}
              value={terminalSecret}
            />
            <button
              aria-label={showSecret ? 'Hide activation key' : 'Show activation key'}
              className="show-secret"
              disabled={submitting}
              onClick={() => setShowSecret((visible) => !visible)}
              type="button"
            >
              {showSecret ? <FaEyeSlash /> : <FaEye />}
            </button>
          </label>
          <button className="terminal-login-button" disabled={submitting} type="submit">
            {submitting ? 'AUTHENTICATING…' : 'LOGIN'}
          </button>
          {error && <div className="terminal-login-error" role="alert">{error}</div>}
        </form>
        <OnScreenKeyboard disabled={submitting} onKey={handleKeyboardKey} />
      </section>
      <footer className="terminal-login-footer"><FaKey /> Virtual Display secure interface</footer>
    </main>
  );
};

export default TerminalLogin;
