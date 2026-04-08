/*
  # Tabela de Rastreamento de Eventos Stripe (Idempotência)

  1. Nova Tabela
    - `stripe_webhook_events`
      - `id` (uuid, chave primária)
      - `event_id` (text, único) - ID único do evento Stripe
      - `event_type` (text) - Tipo do evento (checkout.session.completed, invoice.paid, etc.)
      - `processed_at` (timestamptz) - Data/hora do processamento
      - `store_id` (uuid, nullable) - ID da loja afetada pelo evento
      - `created_at` (timestamptz) - Data/hora da criação do registro

  2. Segurança
    - RLS habilitado na tabela `stripe_webhook_events`
    - Políticas restritivas: apenas SERVICE_ROLE pode acessar

  3. Notas Importantes
    - Esta tabela previne processamento duplicado de webhooks
    - O campo `event_id` é único para garantir que cada evento seja processado apenas uma vez
    - Usa índice para otimizar consultas por event_id
*/

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  store_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Índice para consultas rápidas por event_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id 
  ON stripe_webhook_events(event_id);

-- Índice para consultas por store_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_store_id 
  ON stripe_webhook_events(store_id);

-- Habilitar RLS
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Política restritiva: apenas SERVICE_ROLE pode acessar
CREATE POLICY "Apenas service role pode acessar eventos webhook"
  ON stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);