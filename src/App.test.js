import { render, screen } from '@testing-library/react';
import App, {openDisplayPageInNewTab} from './App';

test('renders terminal authentication when signed out', () => {
  render(<App />);
  expect(screen.getByRole('heading', {name: 'AUTHENTICATION'})).toBeInTheDocument();
});

test('opens display pages in a separate tab without opener access', () => {
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);

  openDisplayPageInNewTab('/results');
  openDisplayPageInNewTab('/tickets');

  expect(open).toHaveBeenNthCalledWith(1, '/results', '_blank', 'noopener,noreferrer');
  expect(open).toHaveBeenNthCalledWith(2, '/tickets', '_blank', 'noopener,noreferrer');
  open.mockRestore();
});
