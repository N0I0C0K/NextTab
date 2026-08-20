import type { ICommandResolver } from '../protocol'
import { Coins } from 'lucide-react'
import { t } from '@/utils/i18n'

// Chinese uppercase digits
const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const UNITS = ['', '拾', '佰', '仟']
const BIG_UNITS = ['', '万', '亿', '万亿']

// Maximum supported number (10^16 - 1) to prevent array out-of-bounds
const MAX_SUPPORTED_NUMBER = 1e16 - 1

// Copy to clipboard with fallback for older browsers
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

/**
 * Convert a number to Chinese uppercase currency (人民币大写)
 * Rules:
 * 1. Use characters: 壹、贰、叁、肆、伍、陆、柒、捌、玖、拾、佰、仟、万、亿、元、角、分、零、整
 * 2. Add "整" after "元" when amount is a whole number (no decimals)
 * 3. When amount ends at "角" (no 分), "整" after "角" is optional (we omit it)
 * 4. Do not add "整" after "分"
 */
export function numberToChineseUppercase(num: number): string {
  if (!Number.isFinite(num) || num < 0 || num > MAX_SUPPORTED_NUMBER) {
    return ''
  }

  // Round to 2 decimal places (分)
  const amount = Math.round(num * 100) / 100

  if (amount === 0) {
    return '零元整'
  }

  // Split integer and decimal parts
  const integerPart = Math.floor(amount)
  const decimalPart = Math.round((amount - integerPart) * 100)

  const jiao = Math.floor(decimalPart / 10)
  const fen = decimalPart % 10

  let result = ''

  // Process integer part
  if (integerPart > 0) {
    result += convertIntegerPart(integerPart) + '元'
  }

  // Process decimal part
  if (jiao === 0 && fen === 0) {
    // No decimals, add "整"
    result += '整'
  } else if (jiao === 0 && fen > 0) {
    // No jiao but has fen
    if (integerPart > 0) {
      result += '零'
    }
    result += DIGITS[fen] + '分'
  } else if (jiao > 0 && fen === 0) {
    // Has jiao but no fen
    // Note: For amounts < 1 yuan with only jiao (e.g., 0.50), we output "伍角" not "零元伍角"
    // This follows common financial document practices
    result += DIGITS[jiao] + '角'
  } else {
    // Has both jiao and fen
    result += DIGITS[jiao] + '角' + DIGITS[fen] + '分'
  }

  return result
}

/**
 * Convert integer part to Chinese uppercase
 */
function convertIntegerPart(num: number): string {
  if (num === 0) return ''

  // Split into groups of 4 digits
  const groups: number[] = []
  let n = num
  while (n > 0) {
    groups.push(n % 10000)
    n = Math.floor(n / 10000)
  }

  let result = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]
    const groupStr = convertFourDigits(group)

    if (groupStr) {
      // Check if we need to add 零 before this group
      if (result && group < 1000 && i < groups.length - 1) {
        result += '零'
      }
      result += groupStr + BIG_UNITS[i]
    } else if (result && i > 0) {
      // Empty group but not the last, might need 零
      // This is handled in the next iteration
    }
  }

  return result
}

/**
 * Convert a 4-digit number to Chinese uppercase
 */
function convertFourDigits(num: number): string {
  if (num === 0) return ''

  const digits = [Math.floor(num / 1000), Math.floor((num % 1000) / 100), Math.floor((num % 100) / 10), num % 10]

  let result = ''
  let prevZero = false

  for (let i = 0; i < 4; i++) {
    const digit = digits[i]
    if (digit === 0) {
      prevZero = true
    } else {
      if (prevZero && result) {
        result += '零'
      }
      result += DIGITS[digit] + UNITS[3 - i]
      prevZero = false
    }
  }

  return result
}

/**
 * Parse input to extract number
 */
function parseInput(input: string): number | null {
  // Parse the number (trigger key already stripped by manager)
  const num = parseFloat(input.trim())
  if (isNaN(num)) {
    return null
  }

  return num
}

export const numberToRmbResolver: ICommandResolver = {
  settings: {
    priority: 50,
    active: true,
    includeInGlobal: true,
    activeKey: 'rmb',
  },
  properties: {
    name: 'numberToRmb',
    displayName: t('numberToRmbLabel'),
    description: t('commandPluginNumberToRmbDescription'),
    icon: Coins,
  },
  resolve: async params => {
    const num = parseInput(params.query)

    if (num === null || num < 0) {
      return null
    }

    const result = numberToChineseUppercase(num)
    if (!result) {
      return null
    }

    return [
      {
        id: 'number-to-rmb-result',
        title: result,
        description: t('numberToRmbClickToCopy'),
        IconType: Coins,
        onSelect: () => {
          copyToClipboard(result)
        },
      },
    ]
  },
}
