export function formatSociabuzzAmount(
  amount: unknown,
  currency: unknown,
  quantity: unknown,
  item: unknown,
  fallbackAmount: unknown,
): string {
  const amountText = typeof amount === 'string' || typeof amount === 'number' ? String(amount).trim() : '';
  const currencyText = typeof currency === 'string' ? currency.trim().toUpperCase() : '';

  if (typeof item === 'string' && item.trim() && typeof quantity !== 'undefined') {
    return `${String(quantity).trim()} ${item.trim()}`.slice(0, 80);
  }
  if (currencyText && amountText) {
    const normalizedAmount = amountText.toUpperCase().startsWith(currencyText)
      ? amountText.slice(currencyText.length).trimStart()
      : amountText;
    return `${currencyText}${normalizedAmount}`.slice(0, 80);
  }
  if (amountText) return amountText.slice(0, 80);
  if (typeof fallbackAmount === 'string' || typeof fallbackAmount === 'number') {
    const fallbackText = String(fallbackAmount).trim();
    if (fallbackText) return fallbackText.slice(0, 80);
  }
  return '0';
}
