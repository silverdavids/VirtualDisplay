import {fireEvent, render, screen, within} from '@testing-library/react';
import {TerminalHeaderActions} from './Grid';

const renderHeader = (overrides = {}) => {
  const props = {
    currentTime: new Date(2026, 6, 24, 20, 2, 1).getTime(),
    onLogout: jest.fn(),
    onOpenTickets: jest.fn(),
    tableTheme: 'dark',
    terminal: {code: 'DISPLAY-001', name: 'Test001'},
    toggleTableTheme: jest.fn(),
    ...overrides,
  };
  render(<TerminalHeaderActions {...props} />);
  return props;
};

test('renders the requested header order and authenticated identity without USERNOW or payout', () => {
  renderHeader();
  const controls = screen.getByLabelText('Terminal controls');
  expect(controls).toHaveTextContent(/20:02:01.*0 USH.*Theme.*Tickets.*DISPLAY-001.*Test001.*Logout/);
  expect(within(controls).queryByText('USERNOW')).not.toBeInTheDocument();
  expect(within(controls).queryByText('Payout')).not.toBeInTheDocument();
});

test('tickets invokes only the tickets handler', () => {
  const props = renderHeader();
  fireEvent.click(screen.getByRole('button', {name: 'Open tickets'}));
  expect(props.onOpenTickets).toHaveBeenCalledTimes(1);
  expect(props.toggleTableTheme).not.toHaveBeenCalled();
  expect(props.onLogout).not.toHaveBeenCalled();
});

test('theme is visible in both modes and invokes the theme handler', () => {
  const props = renderHeader();
  const theme = screen.getByRole('button', {name: 'Switch to light theme'});
  expect(theme).toHaveAttribute('title', 'Switch to light theme');
  fireEvent.click(theme);
  expect(props.toggleTableTheme).toHaveBeenCalledTimes(1);

  renderHeader({tableTheme: 'light'});
  expect(screen.getByRole('button', {name: 'Switch to dark theme'})).toBeInTheDocument();
});

test('logout remains available and invokes logout', () => {
  const props = renderHeader();
  fireEvent.click(screen.getByRole('button', {name: 'Logout'}));
  expect(props.onLogout).toHaveBeenCalledTimes(1);
});
