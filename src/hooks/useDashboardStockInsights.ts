import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

interface StockCurrentBalance {
  stock_item_id: string;
  store_id: string;
  name: string;
  unit: 'kg' | 'l' | 'un';
  current_stock: number;
}

interface StockAlert {
  stock_item_id: string;
  store_id: string;
  name: string;
  unit: 'kg' | 'l' | 'un';
  current_stock: number;
  minimum_quantity: number;
  alert_level: 'low' | 'critical';
}

interface StockConsumption {
  store_id: string;
  stock_item_id: string;
  name: string;
  unit: 'kg' | 'l' | 'un';
  total_output_movements: number;
  total_consumed: number;
  first_output_at: string;
  last_output_at: string;
}

interface DashboardStockInsights {
  totalItems: number;
  lowAlerts: number;
  criticalAlerts: number;
  topConsumedItem: {
    name: string;
    quantity: number;
    unit: 'kg' | 'l' | 'un';
  } | null;
  alerts: StockAlert[];
  topConsumption: StockConsumption[];
  loading: boolean;
  error: string | null;
}

export function useDashboardStockInsights(storeId: string | null): DashboardStockInsights {
  const [data, setData] = useState<DashboardStockInsights>({
    totalItems: 0,
    lowAlerts: 0,
    criticalAlerts: 0,
    topConsumedItem: null,
    alerts: [],
    topConsumption: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!storeId) {
      setData({
        totalItems: 0,
        lowAlerts: 0,
        criticalAlerts: 0,
        topConsumedItem: null,
        alerts: [],
        topConsumption: [],
        loading: false,
        error: null,
      });
      return;
    }

    loadStockInsights();
  }, [storeId]);

  const loadStockInsights = async () => {
    if (!storeId) return;

    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      const [balanceResult, alertsResult, consumptionResult] = await Promise.allSettled([
        supabase
          .from('v_stock_current_balance')
          .select('*')
          .eq('store_id', storeId),

        supabase
          .from('v_stock_alerts')
          .select('*')
          .eq('store_id', storeId)
          .order('alert_level', { ascending: false })
          .order('name', { ascending: true }),

        supabase
          .from('v_stock_consumption_summary')
          .select('*')
          .eq('store_id', storeId)
          .order('total_consumed', { ascending: false })
          .limit(5),
      ]);

      const balanceData = balanceResult.status === 'fulfilled' ? balanceResult.value.data : null;
      const alertsData = alertsResult.status === 'fulfilled' ? alertsResult.value.data : null;
      const consumptionData = consumptionResult.status === 'fulfilled' ? consumptionResult.value.data : null;

      const totalItems = balanceData?.length || 0;
      const lowAlerts = alertsData?.filter((a: StockAlert) => a.alert_level === 'low').length || 0;
      const criticalAlerts = alertsData?.filter((a: StockAlert) => a.alert_level === 'critical').length || 0;
      const alerts = (alertsData || []).slice(0, 5);
      const topConsumption = consumptionData || [];

      const topConsumedItem = consumptionData && consumptionData.length > 0
        ? {
            name: consumptionData[0].name,
            quantity: Number(consumptionData[0].total_consumed),
            unit: consumptionData[0].unit as 'kg' | 'l' | 'un',
          }
        : null;

      setData({
        totalItems,
        lowAlerts,
        criticalAlerts,
        topConsumedItem,
        alerts,
        topConsumption,
        loading: false,
        error: null,
      });

      logger.log('Dashboard stock insights loaded successfully');
    } catch (error) {
      logger.error('Error loading dashboard stock insights:', error);
      setData(prev => ({
        ...prev,
        loading: false,
        error: 'Erro ao carregar insights de estoque',
      }));
    }
  };

  return data;
}
