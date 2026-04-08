import { useState, useEffect } from 'react';
import { Database } from '../lib/database.types';

type StockDeductionMode = Database['public']['Tables']['products']['Row']['stock_deduction_mode'];

interface StockDeductionConfigProps {
  stockItemId: string | null;
  deductionMode: StockDeductionMode;
  deductionMultiplier: number | null;
  onDeductionModeChange: (mode: StockDeductionMode) => void;
  onDeductionMultiplierChange: (multiplier: number | null) => void;
  onStockItemIdChange: (stockItemId: string | null) => void;
  stockItems: Array<{ id: string; name: string; unit: string }>;
}

export function StockDeductionConfig({
  stockItemId,
  deductionMode,
  deductionMultiplier,
  onDeductionModeChange,
  onDeductionMultiplierChange,
  onStockItemIdChange,
  stockItems,
}: StockDeductionConfigProps) {
  const [controlsStock, setControlsStock] = useState(deductionMode !== 'none');

  const handleControlsStockChange = (checked: boolean) => {
    setControlsStock(checked);

    if (!checked) {
      onDeductionModeChange('none');
      onStockItemIdChange(null);
      onDeductionMultiplierChange(null);
    } else if (deductionMode === 'none') {
      // Define modo padrão apenas quando ativa controle pela primeira vez
      onDeductionModeChange('by_quantity');
    }
  };

  const handleModeChange = (mode: StockDeductionMode) => {
    onDeductionModeChange(mode);

    // Clear multiplier if not using by_multiplier mode
    if (mode !== 'by_multiplier') {
      onDeductionMultiplierChange(null);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900">Controle de Estoque</h3>

      {/* Controls Stock Checkbox */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="controls-stock"
          checked={controlsStock}
          onChange={(e) => handleControlsStockChange(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="controls-stock" className="ml-2 text-sm font-medium text-gray-700">
          Controla estoque?
        </label>
      </div>

      {controlsStock && (
        <>
          {/* Stock Item Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item de Estoque Vinculado *
            </label>
            <select
              value={stockItemId || ''}
              onChange={(e) => onStockItemIdChange(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required={controlsStock}
            >
              <option value="">Selecione um item de estoque</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Deduction Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modo de Baixa de Estoque *
            </label>
            <select
              value={deductionMode}
              onChange={(e) => handleModeChange(e.target.value as StockDeductionMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="by_quantity">Pela quantidade vendida</option>
              <option value="by_weight">Pelo peso (em gramas)</option>
              <option value="by_multiplier">Por multiplicador</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {deductionMode === 'none' && 'Não haverá baixa de estoque ao vender este produto'}
              {deductionMode === 'by_quantity' && 'Baixa 1:1 pela quantidade vendida (ex: vende 2 unidades, baixa 2 do estoque)'}
              {deductionMode === 'by_weight' && 'Baixa pelo peso em gramas informado na venda (ex: vende 500g, baixa 500 do estoque)'}
              {deductionMode === 'by_multiplier' && 'Baixa quantidade vendida × multiplicador (ex: vende 1 açaí 500ml, baixa 500g de polpa)'}
            </p>
          </div>

          {/* Multiplier Input */}
          {deductionMode === 'by_multiplier' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Multiplicador *
              </label>
              <input
                type="number"
                value={deductionMultiplier || ''}
                onChange={(e) => onDeductionMultiplierChange(e.target.value ? parseFloat(e.target.value) : null)}
                step="0.0001"
                min="0.0001"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 500 para açaí 500ml"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Quantidade que será baixada do estoque por unidade vendida
              </p>
            </div>
          )}

          {/* Validation Warning */}
          {stockItemId && deductionMode !== 'none' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Configuração atual:</strong>
                {deductionMode === 'by_quantity' && ' Ao vender 1 unidade deste produto, será baixada 1 unidade do item de estoque.'}
                {deductionMode === 'by_weight' && ' Ao vender este produto, será baixada a quantidade em gramas informada no PDV.'}
                {deductionMode === 'by_multiplier' && deductionMultiplier &&
                  ` Ao vender 1 unidade deste produto, será baixado ${deductionMultiplier} do item de estoque.`
                }
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
