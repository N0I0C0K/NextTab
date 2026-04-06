import type { ICommandResolver, ICommandResult } from '../protocol'
import { Calculator, History, Trash2 } from 'lucide-react'
import { t } from '@extension/i18n'
import { Parser } from 'expr-eval'

const CALCULATOR_HISTORY_KEY = 'calculator_history'
const MAX_HISTORY_ITEMS = 20
const FLOATING_POINT_PRECISION = 15

// Create a parser instance
const parser = new Parser()

// List of math functions supported by expr-eval for expression validation
const MATH_FUNCTIONS = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'sqrt',
  'cbrt',
  'log',
  'ln',
  'lg',
  'log2',
  'log10',
  'log1p',
  'expm1',
  'abs',
  'ceil',
  'floor',
  'round',
  'trunc',
  'sign',
  'exp',
  'pow',
  'min',
  'max',
  'hypot',
  'random',
  'fac',
  'pyt',
  'length',
  'if',
  'gamma',
  'roundTo',
  'map',
  'E',
  'PI',
]
const MATH_FUNCTIONS_REGEX = new RegExp(`\\b(${MATH_FUNCTIONS.join('|')})\\b`, 'i')

interface CalculatorHistoryItem {
  expression: string
  result: string
  timestamp: number
}

// Get history from localStorage
function getHistory(): CalculatorHistoryItem[] {
  try {
    const history = localStorage.getItem(CALCULATOR_HISTORY_KEY)
    return history ? JSON.parse(history) : []
  } catch {
    return []
  }
}

// Save history to localStorage
function saveHistory(history: CalculatorHistoryItem[]): void {
  try {
    localStorage.setItem(CALCULATOR_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)))
  } catch {
    // Ignore storage errors
  }
}

// Add item to history
function addToHistory(expression: string, result: string): void {
  const history = getHistory()
  // Don't add duplicate consecutive entries
  if (history.length > 0 && history[0].expression === expression) {
    return
  }
  history.unshift({
    expression,
    result,
    timestamp: Date.now(),
  })
  saveHistory(history)
}

// Clear history
function clearHistory(): void {
  try {
    localStorage.removeItem(CALCULATOR_HISTORY_KEY)
  } catch {
    // Ignore storage errors
  }
}

// Copy to clipboard
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    } catch {
      // Final fallback: show prompt for manual copy
      window.prompt('Copy to clipboard: Ctrl+C, Enter', text)
    }
  }
}

// Normalize expression for parsing
function normalizeExpression(expression: string): string {
  return expression
    .replace(/×/g, '*')
    .replace(/✕/g, '*')
    .replace(/÷/g, '/')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
}

// Check if a string looks like a math expression
function isMathExpression(query: string): boolean {
  // Must contain at least one digit and one operator
  const hasDigit = /\d/.test(query)
  const hasOperator = /[+\-*/%^×÷]/.test(query)
  // Should not contain letters that aren't math functions
  const cleanedQuery = query.replace(MATH_FUNCTIONS_REGEX, '')
  const hasInvalidLetters = /[a-zA-Z]/.test(cleanedQuery)
  // Require at least one operator or function to be considered a math expression
  return hasDigit && (hasOperator || MATH_FUNCTIONS_REGEX.test(query)) && !hasInvalidLetters
}

// Format the result for display
function formatResult(result: number): string {
  if (!Number.isFinite(result)) {
    return result.toString()
  }
  if (Number.isInteger(result) && Math.abs(result) < Number.MAX_SAFE_INTEGER) {
    return result.toString()
  }
  // Handle very large or very small numbers
  if (Math.abs(result) > 1e15 || (Math.abs(result) < 1e-15 && result !== 0)) {
    return result.toExponential(10)
  }
  // Round to avoid floating point errors
  return parseFloat(result.toPrecision(FLOATING_POINT_PRECISION)).toString()
}

// Calculate the expression using expr-eval
function calculate(expression: string): string | null {
  try {
    const normalizedExpr = normalizeExpression(expression)
    const result = parser.evaluate(normalizedExpr)
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null
    }
    return formatResult(result)
  } catch {
    return null
  }
}

export const calculatorResolver: ICommandResolver = {
  properties: {
    name: 'calculator',
    displayName: t('calculator'),
    description: t('commandPluginCalculatorDescription'),
    icon: Calculator,
  },
  resolve: async params => {
    const results: ICommandResult[] = []
    const query = params.query

    // If query is empty, show history
    if (query.length === 0) {
      const history = getHistory()
      if (history.length === 0) {
        return null
      }

      // Add clear history option
      results.push({
        id: 'calc-clear-history',
        title: t('calculatorClearHistory'),
        description: t('calculatorClearHistoryDesc'),
        IconType: Trash2,
        onSelect: () => {
          clearHistory()
        },
      })

      // Add history items
      history.slice(0, 10).forEach((item, index) => {
        results.push({
          id: `calc-history-${index}`,
          title: `${item.expression} = ${item.result}`,
          description: t('calculatorClickToCopy'),
          IconType: History,
          onSelect: () => {
            copyToClipboard(item.result)
          },
        })
      })

      return results
    }

    // Try to calculate the expression
    if (!isMathExpression(query)) {
      return null
    }

    const result = calculate(query)
    if (result === null) {
      return null
    }

    // Add the result
    results.push({
      id: 'calc-result',
      title: `${query} = ${result}`,
      description: t('calculatorClickToCopy'),
      IconType: Calculator,
      onSelect: () => {
        copyToClipboard(result)
        addToHistory(query, result)
      },
    })

    return results
  },
}
