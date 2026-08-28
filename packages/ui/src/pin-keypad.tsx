import { Button } from './components';

export function PinKeypad({ value, onChange, maxLength = 8 }: { value: string; onChange: (value: string) => void; maxLength?: number }) {
  const append = (digit: string) => { if (value.length < maxLength) onChange(`${value}${digit}`); };
  return <div className="urp-pin-keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((key) => <Button variant="secondary" type="button" key={key} onClick={() => key === 'clear' ? onChange('') : key === 'back' ? onChange(value.slice(0, -1)) : append(key)}>{key === 'back' ? 'Back' : key}</Button>)}</div>;
}
