/*
  # Adicionar Campos do Stripe na Tabela Stores

  1. Alterações
    - Adiciona `stripe_customer_id` (text, opcional) - ID do cliente no Stripe
    - Adiciona `stripe_subscription_id` (text, opcional) - ID da assinatura no Stripe
    
  2. Notas Importantes
    - Os campos subscription_status, plan_name, trial_ends_at e subscription_ends_at já existem
    - Esta migration adiciona apenas os campos necessários para integração com Stripe
    - Usa verificação IF NOT EXISTS para evitar erros em caso de re-execução
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE stores ADD COLUMN stripe_customer_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE stores ADD COLUMN stripe_subscription_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stores_stripe_customer_id ON stores(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_stores_stripe_subscription_id ON stores(stripe_subscription_id);
