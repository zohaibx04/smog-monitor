import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon, type IconName } from './App'

export type SelectOption = { value: string; label: string; disabled?: boolean }

export default function SelectDropdown({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  ariaLabel,
  icon,
  name,
  disabled,
  className = '',
}: {
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  icon?: IconName
  name?: string
  disabled?: boolean
  className?: string
}) {
  const isControlled = value !== undefined
  const firstEnabled = options.find(o => !o.disabled)?.value ?? ''
  const [internalValue, setInternalValue] = useState(defaultValue ?? firstEnabled)
  const currentValue = isControlled ? value : internalValue
  const selectedOption = options.find(o => o.value === currentValue)

  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [indicator, setIndicator] = useState<{ top: number; height: number; ready: boolean }>({
    top: 0,
    height: 0,
    ready: false,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shouldScrollIntoView = useRef(false)
  const typeAhead = useRef({ query: '', timer: 0 })
  const listboxId = useId()

  useEffect(() => {
    if (!isControlled && options.length > 0 && !options.some(o => o.value === internalValue)) {
      setInternalValue(defaultValue && options.some(o => o.value === defaultValue) ? defaultValue : firstEnabled)
    }
  }, [defaultValue, firstEnabled, internalValue, isControlled, options])

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  function getInitialHighlight() {
    const selectedIdx = options.findIndex(o => o.value === currentValue && !o.disabled)
    if (selectedIdx >= 0) return selectedIdx
    return options.findIndex(o => !o.disabled)
  }

  function openMenu() {
    if (disabled || options.length === 0) return
    shouldScrollIntoView.current = true
    setHighlightedIndex(getInitialHighlight())
    setOpen(true)
  }

  function selectOption(option: SelectOption) {
    if (option.disabled) return
    if (!isControlled) setInternalValue(option.value)
    onChange?.(option.value)
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function moveHighlight(step: 1 | -1) {
    if (!options.length) return
    let idx = highlightedIndex
    for (let i = 0; i < options.length; i += 1) {
      idx = (idx + step + options.length) % options.length
      if (!options[idx].disabled) {
        shouldScrollIntoView.current = true
        setHighlightedIndex(idx)
        return
      }
    }
  }

  function jumpHighlight(fromEnd: boolean) {
    const indices = options.map((_, i) => i)
    if (fromEnd) indices.reverse()
    const match = indices.find(i => !options[i].disabled)
    if (match !== undefined) {
      shouldScrollIntoView.current = true
      setHighlightedIndex(match)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveHighlight(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveHighlight(-1)
        break
      case 'Home':
        event.preventDefault()
        jumpHighlight(false)
        break
      case 'End':
        event.preventDefault()
        jumpHighlight(true)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          selectOption(options[highlightedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          window.clearTimeout(typeAhead.current.timer)
          typeAhead.current.query += event.key.toLowerCase()
          const q = typeAhead.current.query
          const matchIdx = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(q))
          if (matchIdx >= 0) {
            shouldScrollIntoView.current = true
            setHighlightedIndex(matchIdx)
          }
          typeAhead.current.timer = window.setTimeout(() => {
            typeAhead.current.query = ''
          }, 500)
        }
        break
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setIndicator(prev => (prev.ready ? { ...prev, ready: false } : prev))
      return
    }
    const list = listRef.current
    if (!list) return
    const targetIdx = highlightedIndex >= 0 ? highlightedIndex : getInitialHighlight()
    const optionEl = targetIdx >= 0 ? list.querySelectorAll<HTMLButtonElement>('.custom-select-option')[targetIdx] : null
    if (!optionEl) {
      setIndicator(prev => (prev.ready ? { ...prev, ready: false } : prev))
      return
    }
    setIndicator({ top: optionEl.offsetTop, height: optionEl.offsetHeight, ready: true })
    if (shouldScrollIntoView.current) {
      shouldScrollIntoView.current = false
      optionEl.scrollIntoView({ block: 'nearest' })
    }
  }, [open, highlightedIndex, options.length])

  return (
    <div
      ref={containerRef}
      className={`custom-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
    >
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {icon && (
          <span className="custom-select-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        )}
        <span className="custom-select-label">
          {selectedOption ? selectedOption.label : placeholder ?? 'Select'}
        </span>
        <span className="custom-select-chevron" aria-hidden="true">
          <Icon name="chevronDown" size={16} />
        </span>
      </button>

      {open && (
        <div className="custom-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          <div className="custom-select-list" ref={listRef}>
            <span
              className="dropdown-glide-indicator"
              aria-hidden="true"
              style={{
                transform: `translateY(${indicator.top}px)`,
                height: `${indicator.height}px`,
                opacity: indicator.ready ? 1 : 0,
              }}
            />
            {options.map((opt, index) => {
              const isSelected = opt.value === currentValue
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className={`custom-select-option${isSelected ? ' is-selected' : ''}${isHighlighted ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => {
                    if (!opt.disabled) setHighlightedIndex(index)
                  }}
                  onClick={() => selectOption(opt)}
                >
                  <span className="custom-select-option-label">{opt.label}</span>
                  {isSelected && <Icon name="check" size={16} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
