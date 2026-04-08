export const PRODUCT_CATEGORIES = [
  { id: 'Açaí', label: 'Açaí', color: 'purple' },
  { id: 'Petiscos', label: 'Petiscos', color: 'orange' },
  { id: 'Drinks', label: 'Drinks', color: 'blue' },
  { id: 'Cervejas', label: 'Cervejas', color: 'amber' },
  { id: 'Sucos', label: 'Sucos', color: 'green' },
  { id: 'Água', label: 'Água', color: 'cyan' },
  { id: 'Doses', label: 'Doses', color: 'red' },
  { id: 'Caldos', label: 'Caldos', color: 'yellow' },
  { id: 'Adicionais', label: 'Adicionais', color: 'pink' },
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number]['id'];

export const getCategoryColor = (categoryId: string) => {
  const category = PRODUCT_CATEGORIES.find(c => c.id === categoryId);
  return category?.color || 'gray';
};

export const getCategoryLabel = (categoryId: string) => {
  const category = PRODUCT_CATEGORIES.find(c => c.id === categoryId);
  return category?.label || categoryId;
};
