import { render, screen } from '@testing-library/react';
import App from './App';

test('renders terminal authentication when signed out', () => {
  render(<App />);
  expect(screen.getByRole('heading', {name: 'AUTHENTICATION'})).toBeInTheDocument();
});
