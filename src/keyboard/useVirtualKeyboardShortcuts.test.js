import {fireEvent, render, screen} from '@testing-library/react';
import {useVirtualKeyboardShortcuts} from './useVirtualKeyboardShortcuts';

const Harness = ({onExecute = jest.fn(), onPrint = jest.fn()}) => {
  const keyboard = useVirtualKeyboardShortcuts({onExecute, onPrint});
  return (
    <>
      <input aria-label="normal input" />
      <output aria-label="shortcut">{keyboard.shortcut}</output>
      <output aria-label="highlight">{keyboard.highlightKey}</output>
    </>
  );
};

test('captures a shortcut globally and executes it on Enter', () => {
  const onExecute = jest.fn(() => ({ok: true, message: 'Added', highlightKey: 'match:selection'}));
  render(<Harness onExecute={onExecute} />);

  fireEvent.keyDown(window, {key: '1'});
  fireEvent.keyDown(window, {key: '/'});
  fireEvent.keyDown(window, {key: '2'});
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('1/2');

  fireEvent.keyDown(window, {key: 'Enter'});
  expect(onExecute).toHaveBeenCalledWith('1/2');
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('');
  expect(screen.getByLabelText('highlight')).toHaveTextContent('match:selection');
});

test('supports Backspace and clears with Escape', () => {
  render(<Harness />);
  fireEvent.keyDown(window, {key: '1'});
  fireEvent.keyDown(window, {key: '/'});
  fireEvent.keyDown(window, {key: '1'});
  fireEvent.keyDown(window, {key: 'Backspace'});
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('1/');
  fireEvent.keyDown(window, {key: 'Escape'});
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('');
});

test('ignores typing in inputs and modified key combinations', () => {
  render(<Harness />);
  const input = screen.getByLabelText('normal input');
  input.focus();
  fireEvent.keyDown(input, {key: '1'});
  fireEvent.keyDown(window, {key: '1', ctrlKey: true});
  fireEvent.keyDown(window, {key: '1', altKey: true});
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('');
});

test('runs eligible function-key actions without capturing their characters', () => {
  const onPrint = jest.fn(() => ({ok: true, message: 'Printing'}));
  render(<Harness onPrint={onPrint} />);
  fireEvent.keyDown(window, {key: 'F9'});
  expect(onPrint).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('shortcut')).toHaveTextContent('');
});
