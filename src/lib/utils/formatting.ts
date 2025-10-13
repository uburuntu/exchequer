/**
 * Formatting utilities for currency, numbers, and display
 */

import type Decimal from 'decimal.js-light';
import { roundDecimal } from './decimal';

/**
 * Format currency amount in GBP
 * Uses proper UK formatting with comma thousand separators
 *
 * @param amount - Decimal amount
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "£12,345.67"
 */
export function formatCurrency(amount: Decimal, decimals: number = 2): string {
  const rounded = roundDecimal(amount, decimals);
  const parts = rounded.toFixed(decimals).split('.');
  const integerPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = parts[1] || '00';
  return `£${integerPart}.${decimalPart}`;
}

/**
 * Format number with thousand separators
 *
 * @param num - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "12,345.67"
 */
export function formatNumber(num: number | Decimal, decimals: number = 2): string {
  const value = typeof num === 'number' ? num : parseFloat(num.toString());
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format quantity (number of shares)
 * Removes unnecessary decimal places for whole numbers
 *
 * @param quantity - Decimal quantity
 * @returns Formatted string
 */
export function formatQuantity(quantity: Decimal): string {
  // If it's a whole number, show no decimals
  if (quantity.modulo(1).equals(0)) {
    return quantity.toFixed(0);
  }
  // Otherwise show up to 4 decimal places, removing trailing zeros
  return quantity.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * Format percentage
 *
 * @param value - Decimal value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "15.0%"
 */
export function formatPercentage(value: Decimal, decimals: number = 1): string {
  const percentage = value.times(100);
  return `${roundDecimal(percentage, decimals).toString()}%`;
}

/**
 * Format gain/loss with proper sign
 * Uses proper minus sign (−) instead of hyphen (-)
 *
 * @param amount - Decimal amount
 * @returns Formatted string with sign
 */
export function formatGainLoss(amount: Decimal): string {
  const formatted = formatCurrency(amount.abs());
  if (amount.isNegative()) {
    // Use proper minus sign (U+2212) not hyphen
    return `−${formatted}`;
  } else if (amount.isPositive()) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Get CSS class for gain/loss styling
 *
 * @param amount - Decimal amount
 * @returns CSS class name ('gain', 'loss', or 'neutral')
 */
export function getGainLossClass(amount: Decimal): string {
  if (amount.isPositive()) {
    return 'gain';
  } else if (amount.isNegative()) {
    return 'loss';
  }
  return 'neutral';
}

/**
 * Format rule type for display
 * Converts SCREAMING_SNAKE_CASE to Title Case
 *
 * @param ruleType - Rule type string
 * @returns Formatted string like "Same Day"
 */
export function formatRuleType(ruleType: string): string {
  return ruleType
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
