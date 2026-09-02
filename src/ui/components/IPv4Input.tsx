import React, { useEffect, useRef, useState } from 'react';

export type IPv4Octets = [string, string, string, string];

export function splitIPv4(value: string): IPv4Octets {
  const parts = value.split('.').slice(0, 4);
  return [parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || ''];
}

export function canonicalIPv4(octets: IPv4Octets): string | null {
  if (octets.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return octets.map(part => String(Number(part))).join('.');
}

export function parseIPv4Paste(text: string): { octets: IPv4Octets; prefix?: string } | null {
  const match = text.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!match) return null;
  const octets = match.slice(1, 5) as IPv4Octets;
  if (!canonicalIPv4(octets)) return null;
  return { octets, prefix: match[5] };
}

export function acceptsOctet(value: string): boolean {
  return /^\d{0,3}$/.test(value) && (value === '' || Number(value) <= 255);
}

export function nextOctetForKey(index: number, key: string, value: string): number {
  if (key === '.') return Math.min(3, index + 1);
  if (key === 'Backspace' && value === '') return Math.max(0, index - 1);
  return index;
}

export function shouldAdvanceOctet(value: string): boolean {
  return value.length === 3 || (value.length === 2 && Number(value) > 25);
}

interface IPv4InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  assistFrom?: string;
  prefix?: string;
  onPrefixChange?: (value: string) => void;
  prefixMin?: number;
  prefixMax?: number;
  onValidityChange?: (valid: boolean) => void;
}

export const IPv4Input: React.FC<IPv4InputProps> = ({
  label, value, onChange, assistFrom, prefix, onPrefixChange, prefixMin = 0, prefixMax = 32, onValidityChange,
}) => {
  const [octets, setOctets] = useState<IPv4Octets>(() => splitIPv4(value));
  const [touched, setTouched] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (value && value !== canonicalIPv4(octets)) setOctets(splitIPv4(value));
  }, [value]);

  useEffect(() => {
    if (value || octets.some(Boolean) || !assistFrom) return;
    const source = canonicalIPv4(splitIPv4(assistFrom));
    if (!source) return;
    const [a, b, c] = source.split('.');
    setOctets([a, b, c, '']);
  }, [assistFrom, value]);

  const prefixValid = prefix === undefined || (/^\d{1,2}$/.test(prefix) && Number(prefix) >= prefixMin && Number(prefix) <= prefixMax);
  const addressValid = canonicalIPv4(octets) !== null;
  useEffect(() => onValidityChange?.(addressValid && prefixValid), [addressValid, prefixValid, onValidityChange]);

  const commit = (next: IPv4Octets) => {
    setOctets(next);
    onChange(canonicalIPv4(next) || next.join('.'));
  };

  const paste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = parseIPv4Paste(event.clipboardData.getData('text'));
    if (!parsed) return;
    event.preventDefault();
    commit(parsed.octets);
    if (parsed.prefix !== undefined && onPrefixChange) onPrefixChange(parsed.prefix);
    inputs.current[3]?.focus();
  };

  return <div className="min-w-0">
    <span className="mb-1 block text-[10px] font-semibold text-slate-500">{label}</span>
    <div role="group" aria-label={label} className={`flex min-w-[220px] items-center rounded border bg-white px-2 font-mono text-xs dark:bg-slate-950 ${touched && (!addressValid || !prefixValid) ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'}`}>
      {octets.map((part, index) => <React.Fragment key={index}>
        {index > 0 && <span aria-hidden="true" className="text-slate-400">.</span>}
        <input
          ref={element => { inputs.current[index] = element; }}
          aria-label={`${label} octet ${index + 1}`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={part}
          onPaste={paste}
          onBlur={() => setTouched(true)}
          onChange={event => {
            const nextValue = event.target.value.replace(/\D/g, '');
            if (!acceptsOctet(nextValue)) return;
            const next = [...octets] as IPv4Octets;
            next[index] = nextValue;
            commit(next);
            if (shouldAdvanceOctet(nextValue) && index < 3) inputs.current[index + 1]?.focus();
          }}
          onKeyDown={event => {
            const nextIndex = nextOctetForKey(index, event.key, part);
            if (nextIndex !== index) { event.preventDefault(); inputs.current[nextIndex]?.focus(); }
          }}
          className="w-9 bg-transparent py-2 text-center outline-none"
        />
      </React.Fragment>)}
      {prefix !== undefined && <>
        <span aria-hidden="true" className="px-1 text-slate-400">/</span>
        <input
          aria-label={`${label} prefix`}
          inputMode="numeric"
          value={prefix}
          onBlur={() => setTouched(true)}
          onChange={event => {
            const next = event.target.value.replace(/\D/g, '').slice(0, 2);
            if (next === '' || Number(next) <= 32) onPrefixChange?.(next);
          }}
          className="w-8 bg-transparent py-2 text-center outline-none"
        />
      </>}
    </div>
    {touched && !addressValid && <span className="mt-1 block text-[10px] text-rose-600">Enter all four octets from 0 to 255.</span>}
    {touched && addressValid && !prefixValid && <span className="mt-1 block text-[10px] text-rose-600">Prefix must be /{prefixMin} through /{prefixMax}.</span>}
  </div>;
};
