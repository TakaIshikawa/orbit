"use client";

import { useState, useRef, useCallback } from "react";

interface DomainKeywordInputProps {
  label: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  maxItems?: number;
}

export function DomainKeywordInput({
  label,
  placeholder = "Type and press Enter",
  values,
  onChange,
  suggestions = [],
  maxItems = 10,
}: DomainKeywordInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addValue = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed) && values.length < maxItems) {
      onChange([...values, trimmed]);
      setInputValue("");
    }
  }, [values, onChange, maxItems]);

  const removeValue = useCallback((valueToRemove: string) => {
    onChange(values.filter((v) => v !== valueToRemove));
  }, [values, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addValue(inputValue);
    } else if (e.key === "Backspace" && !inputValue && values.length > 0) {
      removeValue(values[values.length - 1]);
    }
  };

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !values.includes(s.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <div className="flex flex-wrap gap-2 p-2 min-h-[42px] border border-gray-700 rounded-lg bg-gray-800/50 focus-within:border-blue-500">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-gray-200 text-sm rounded"
            >
              {value}
              <button
                type="button"
                onClick={() => removeValue(value)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={values.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white text-sm"
            disabled={values.length >= maxItems}
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
            {filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addValue(suggestion)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      {values.length >= maxItems && (
        <p className="text-xs text-gray-500">Maximum {maxItems} items reached</p>
      )}
    </div>
  );
}
