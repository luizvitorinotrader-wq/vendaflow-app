/*
  # Criar tabela de tokens de Magic Link

  1. Nova Tabela
    - `magic_link_tokens`
      - `id` (uuid, chave primária)
      - `user_id` (uuid, referência para auth.users)
      - `token` (text, único, indexado)
      - `email` (text, email do usuário)
      - `used` (boolean, indica se já foi usado)
      - `expires_at` (timestamptz, validade de 15 minutos)
      - `ip_address` (text, IP da solicitação)
      - `created_at` (timestamptz, data de criação)
      - `used_at` (timestamptz, data de uso)

  2. Segurança
    - Habilitar RLS na tabela
    - Sem políticas públicas (apenas edge functions com service role)
    - Token único e indexado para busca rápida

  3. Índices
    - Índice no campo token para buscas rápidas
    - Índice no campo email para rate limiting

  4. Notas Importantes
    - Validade padrão de 15 minutos
    - Token invalidado após primeiro uso
    - Registro de IP para auditoria
    - Limpeza automática de tokens expirados
*/

-- Criar tabela de tokens de magic link
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  email text NOT NULL,
  used boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  ip_address text,
  created_at timestamptz DEFAULT now(),
  used_at timestamptz
);

-- Habilitar RLS
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Criar índice no token para busca rápida
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_token ON magic_link_tokens(token);

-- Criar índice no email para rate limiting
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens(email);

-- Criar índice em expires_at para limpeza de tokens expirados
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);

-- Função para limpar tokens expirados (executar periodicamente)
CREATE OR REPLACE FUNCTION clean_expired_magic_links()
RETURNS void AS $$
BEGIN
  DELETE FROM magic_link_tokens
  WHERE expires_at < now() - interval '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
