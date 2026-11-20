import { useRef, useState } from 'react';
import Form from 'react-bootstrap/Form';
import { Search, X } from 'react-bootstrap-icons';

type ClubSearchProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  inputRef?: (node: HTMLInputElement | null) => void;
  size?: 'sm' | 'lg';
  className?: string;
};

export default function ClubSearch({
  value,
  onChange,
  label,
  placeholder,
  inputRef,
  size = 'lg',
  className = '',
}: ClubSearchProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const compact = size === 'sm';

  function setInput(node: HTMLInputElement | null) {
    localRef.current = node;
    inputRef?.(node);
  }

  return (
    <div className={`position-relative ${className}`.trim()} role="search">
      <span
        className="position-absolute top-50 start-0 translate-middle-y ms-3 text-secondary d-flex"
        style={{ pointerEvents: 'none' }}
      >
        <Search size={compact ? 16 : 18} aria-hidden="true" focusable="false" />
      </span>

      <Form.Control
        ref={setInput}
        type="text"
        size={size}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`rounded-4 ${compact ? 'ps-5 pe-5 py-1' : 'ps-5 pe-5'}`}
        style={{
          backgroundColor: '#d9d9d9',
          border: focused ? '1px solid #3046c3' : '1px solid #333',
          boxShadow: focused ? '0 0 0 0.25rem #3046c340' : 'none',
        }}
      />

      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            localRef.current?.focus();
          }}
          className="position-absolute top-50 end-0 translate-middle-y me-3 btn p-1 border-0 bg-transparent text-secondary d-flex"
        >
          <X size={compact ? 16 : 30} aria-hidden="true" focusable="false" />
        </button>
      )}
    </div>
  );
}
