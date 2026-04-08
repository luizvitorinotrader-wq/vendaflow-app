/**
 * Login Authentication Logic
 *
 * Encapsulates login flow with proper error handling and standardized responses.
 */

import { supabase } from '../supabase';

interface LoginParams {
  email: string;
  password: string;
}

interface LoginSuccess {
  ok: true;
  data: {
    userId: string;
    email: string;
  };
}

interface LoginFailure {
  ok: false;
  message: string;
  rawError?: unknown;
}

type LoginResult = LoginSuccess | LoginFailure;

export async function loginWithPassword({
  email,
  password,
}: LoginParams): Promise<LoginResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error('Login error:', error);

      if (error.message.includes('Invalid login credentials')) {
        return {
          ok: false,
          message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.',
          rawError: error,
        };
      }

      if (error.message.includes('Email not confirmed')) {
        return {
          ok: false,
          message: 'E-mail não confirmado. Verifique sua caixa de entrada.',
          rawError: error,
        };
      }

      if (error.status === 500) {
        return {
          ok: false,
          message: 'Erro interno do servidor. Tente novamente em alguns instantes.',
          rawError: error,
        };
      }

      return {
        ok: false,
        message: 'Erro ao fazer login. Tente novamente.',
        rawError: error,
      };
    }

    if (!data.user) {
      return {
        ok: false,
        message: 'Resposta inesperada do servidor. Tente novamente.',
      };
    }

    return {
      ok: true,
      data: {
        userId: data.user.id,
        email: data.user.email || '',
      },
    };
  } catch (error) {
    console.error('Unexpected login error:', error);

    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return {
          ok: false,
          message: 'Erro de conexão. Verifique sua internet e tente novamente.',
          rawError: error,
        };
      }
    }

    return {
      ok: false,
      message: 'Erro inesperado ao fazer login. Tente novamente.',
      rawError: error,
    };
  }
}
