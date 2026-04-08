import { Link } from 'react-router-dom';
import { Package, AlertTriangle, TrendingDown, BarChart3, ArrowRight } from 'lucide-react';
import { useDashboardStockInsights } from '../hooks/useDashboardStockInsights';
import { formatQuantity } from '../lib/formatters';

interface DashboardStockInsightsProps {
  storeId: string | null;
}

export default function DashboardStockInsights({ storeId }: DashboardStockInsightsProps) {
  const {
    totalItems,
    lowAlerts,
    criticalAlerts,
    topConsumedItem,
    alerts,
    topConsumption,
    loading,
    error,
  } = useDashboardStockInsights(storeId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Estoque Inteligente</h2>
          <p className="text-sm text-gray-600 mt-1">Insights e alertas de estoque</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <div className="text-gray-500">Carregando insights de estoque...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Estoque Inteligente</h2>
          <p className="text-sm text-gray-600 mt-1">Insights e alertas de estoque</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const summaryCards = [
    {
      title: 'Total de Insumos',
      value: totalItems.toString(),
      subtitle: 'monitorados',
      icon: <Package className="w-6 h-6" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Alertas Baixos',
      value: lowAlerts.toString(),
      subtitle: lowAlerts === 1 ? 'item' : 'itens',
      icon: <AlertTriangle className="w-6 h-6" />,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      title: 'Itens Críticos',
      value: criticalAlerts.toString(),
      subtitle: criticalAlerts === 1 ? 'item' : 'itens',
      icon: <TrendingDown className="w-6 h-6" />,
      color: 'bg-red-50 text-red-600',
    },
    {
      title: 'Mais Consumido',
      value: topConsumedItem
        ? `${formatQuantity(topConsumedItem.quantity, topConsumedItem.unit)} ${topConsumedItem.unit}`
        : '—',
      subtitle: topConsumedItem?.name || 'Sem consumo registrado',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'bg-green-50 text-green-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Estoque Inteligente</h2>
          <p className="text-sm text-gray-600 mt-1">Insights e alertas de estoque</p>
        </div>
        <Link
          to="/app/stock"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Ver Estoque Completo
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((card, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.color}`}>
                {card.icon}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{card.value}</div>
            <div className="text-sm text-gray-600">{card.title}</div>
            {card.subtitle && (
              <div className="text-xs text-gray-500 mt-1 truncate">{card.subtitle}</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-bold text-gray-900">Alertas de Estoque Crítico</h3>
          </div>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum alerta de estoque no momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const isCritical = alert.alert_level === 'critical';
                return (
                  <div
                    key={alert.stock_item_id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isCritical
                        ? 'bg-red-50 border-red-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{alert.name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {formatQuantity(Number(alert.current_stock), alert.unit)} {alert.unit} /{' '}
                        {formatQuantity(Number(alert.minimum_quantity), alert.unit)} {alert.unit} mín
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ml-3 ${
                        isCritical
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isCritical ? 'CRÍTICO' : 'BAIXO'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-bold text-gray-900">Insumos Mais Consumidos</h3>
          </div>
          {topConsumption.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Sem dados de consumo ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topConsumption.map((item, index) => (
                <div
                  key={item.stock_item_id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-700">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.unit}</div>
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <div className="font-semibold text-gray-900">
                      {formatQuantity(Number(item.total_consumed), item.unit as 'kg' | 'l' | 'un')}
                    </div>
                    <div className="text-xs text-gray-500">{item.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
