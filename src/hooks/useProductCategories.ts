import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useFeatureFlag } from './useFeatureFlag';
import type { Database } from '../lib/database.types';

type ProductCategory = Database['public']['Tables']['product_categories']['Row'];

export const useProductCategories = (storeId?: string) => {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { isEnabled, loading: flagLoading } = useFeatureFlag(
    'enable_product_categories',
    storeId
  );

  useEffect(() => {
    const loadCategories = async () => {
      if (!isEnabled || !storeId) {
        setCategories([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('product_categories')
          .select('*')
          .eq('store_id', storeId)
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) {
          console.error('Erro ao carregar categorias:', error);
          setCategories([]);
        } else {
          setCategories(data || []);
        }

        setLoading(false);
      } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        setCategories([]);
        setLoading(false);
      }
    };

    if (!flagLoading) {
      loadCategories();
    }
  }, [isEnabled, storeId, flagLoading]);

  return { categories, loading, isEnabled };
};
