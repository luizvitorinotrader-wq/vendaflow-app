import { useProductCategories } from '../hooks/useProductCategories';

interface CategorySelectProps {
  storeId: string;
  value: string;
  onChange: (categoryId: string, categoryName: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export const CategorySelect = ({
  storeId,
  value,
  onChange,
  required = false,
  disabled = false,
}: CategorySelectProps) => {
  const { categories, loading, isEnabled } = useProductCategories(storeId);

  if (!isEnabled || loading) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const categoryId = e.target.value;
    const category = categories.find((c) => c.id === categoryId);
    onChange(categoryId, category?.name || '');
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
    >
      <option value="">Selecione uma categoria</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
};
