import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useFeatureFlag = (flagName: string, storeId?: string) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFlag = async () => {
      if (!storeId) {
        setIsEnabled(false);
        setLoading(false);
        return;
      }

      try {
        // 1. Buscar flag específica da loja
        const { data: storeFlag } = await supabase
          .from('feature_flags')
          .select('is_enabled')
          .eq('feature_name', flagName)
          .eq('store_id', storeId)
          .maybeSingle();

        if (storeFlag !== null) {
          // Loja tem configuração própria - usar ela
          setIsEnabled(storeFlag.is_enabled);
          setLoading(false);
          return;
        }

        // 2. Buscar flag global (store_id IS NULL)
        const { data: globalFlag } = await supabase
          .from('feature_flags')
          .select('is_enabled')
          .eq('feature_name', flagName)
          .is('store_id', null)
          .maybeSingle();

        setIsEnabled(globalFlag?.is_enabled || false);
        setLoading(false);
      } catch (error) {
        console.error('Erro ao verificar feature flag:', error);
        setIsEnabled(false);
        setLoading(false);
      }
    };

    checkFlag();
  }, [flagName, storeId]);

  return { isEnabled, loading };
};
