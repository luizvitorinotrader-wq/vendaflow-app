export function formatQuantity(value: number, unit: 'kg' | 'l' | 'un'): string {
  if (unit === 'un') {
    return Math.round(value).toString();
  }
  return value.toFixed(2);
}

export function formatQuantityWithUnit(value: number, unit: 'kg' | 'l' | 'un'): string {
  const unitLabels = {
    kg: 'kg',
    l: 'L',
    un: 'un',
  };

  return `${formatQuantity(value, unit)} ${unitLabels[unit]}`;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export function formatMoneyBRL(value: number): string {
  return `R$ ${formatMoney(value)}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
