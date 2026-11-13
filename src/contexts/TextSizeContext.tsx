/**
 * TextSizeContext — global font-size multiplier for accessibility.
 *
 * Three levels: Normal (1×), Malaki (1.2×), Napaka-laki (1.4×).
 * The active size is applied as a `data-textsize` attribute on `<html>`,
 * which CSS rules in index.css map to actual font-size overrides.
 * Preference is persisted in localStorage so it survives reloads.
 */
import { createContext, useContext, useEffect, useState } from 'react'

export type TextSize = 'normal' | 'malaki' | 'napaka-laki'

interface TextSizeContextValue {
  textSize: TextSize
  setTextSize: (size: TextSize) => void
}

const STORAGE_KEY = 'sobre-text-size'

const TextSizeContext = createContext<TextSizeContextValue>({
  textSize: 'normal',
  setTextSize: () => {},
})

function applyTextSize(size: TextSize) {
  document.documentElement.setAttribute('data-textsize', size)
}

export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as TextSize | null) ?? 'normal'
  })

  // Apply on mount and whenever it changes
  useEffect(() => {
    applyTextSize(textSize)
    localStorage.setItem(STORAGE_KEY, textSize)
  }, [textSize])

  const setTextSize = (size: TextSize) => {
    setTextSizeState(size)
  }

  return (
    <TextSizeContext.Provider value={{ textSize, setTextSize }}>
      {children}
    </TextSizeContext.Provider>
  )
}

export function useTextSize() {
  return useContext(TextSizeContext)
}
