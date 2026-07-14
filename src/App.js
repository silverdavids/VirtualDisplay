import {useCallback, useEffect, useState} from 'react';
import {Grid, TicketsPage} from './components';
import TerminalLogin from './components/auth/TerminalLogin';
import TerminalStatus from './components/auth/TerminalStatus';
import {isTerminalAuthenticated, TERMINAL_AUTH_CHANGED_EVENT} from './auth/terminalAuth';

const readLocation = () => ({path: window.location.pathname, search: window.location.search});

function App() {
  const [location, setLocation] = useState(readLocation);
  const [authenticated, setAuthenticated] = useState(isTerminalAuthenticated);

  const navigate = useCallback((nextPath, {replace = false} = {}) => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    setLocation(readLocation());
  }, []);

  useEffect(() => {
    const refreshLocation = () => setLocation(readLocation());
    const refreshAuth = () => setAuthenticated(isTerminalAuthenticated());
    window.addEventListener('popstate', refreshLocation);
    window.addEventListener('storage', refreshAuth);
    window.addEventListener(TERMINAL_AUTH_CHANGED_EVENT, refreshAuth);
    return () => {
      window.removeEventListener('popstate', refreshLocation);
      window.removeEventListener('storage', refreshAuth);
      window.removeEventListener(TERMINAL_AUTH_CHANGED_EVENT, refreshAuth);
    };
  }, []);

  useEffect(() => {
    if (!authenticated && location.path !== '/login') {
      navigate(`/login?from=${encodeURIComponent(`${location.path}${location.search}`)}`, {replace: true});
    } else if (authenticated && location.path === '/login') {
      const requestedPath = new URLSearchParams(location.search).get('from');
      const safePath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
      navigate(safePath, {replace: true});
    }
  }, [authenticated, location.path, location.search, navigate]);

  if (!authenticated) {
    return <TerminalLogin onAuthenticated={() => setAuthenticated(true)} />;
  }

  const content = location.path.startsWith('/tickets')
    ? <TicketsPage onBackToDisplay={() => navigate('/')} />
    : <Grid onOpenTickets={() => navigate('/tickets')} />;

  return (
    <div className="App">
      <TerminalStatus onLogout={() => navigate('/login', {replace: true})} />
      {content}
    </div>
  );
}

export default App;
