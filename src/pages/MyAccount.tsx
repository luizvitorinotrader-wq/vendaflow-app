import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  User,
  Mail,
  AlertCircle,
  CheckCircle,
  Lock,
  Shield,
  LogOut,
  Store,
  CircleUser as UserCircle,
  Crown,
  BadgeCheck,
  KeyRound,
} from 'lucide-react';
import { logger } from '../lib/logger';

export default function MyAccount() {
  const { profile, store, signOut, effectiveUserRole, isSuperAdmin, isSupportMode } = useAuth();
  const navigate = useNavigate();

  const [currentEmail, setCurrentEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loadingName, setLoadingName] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  const [nameMessage, setNameMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [emailMessage, setEmailMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    loadCurrentUser();
  }, [profile]);

  const loadCurrentUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      setCurrentEmail(user.email);
    }

    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setNameMessage({ type: 'error', text: 'Por favor, insira um nome válido.' });
      return;
    }

    setLoadingName(true);
    setNameMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', user.id);

      if (error) throw error;

      setNameMessage({ type: 'success', text: 'Nome atualizado com sucesso!' });
      setTimeout(() => setNameMessage(null), 3000);
    } catch (error: any) {
      logger.error('Erro ao atualizar nome:', error);
      setNameMessage({
        type: 'error',
        text: error.message || 'Erro ao atualizar nome. Tente novamente.',
      });
    } finally {
      setLoadingName(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmail || !newEmail.includes('@')) {
      setEmailMessage({ type: 'error', text: 'Por favor, insira um email válido.' });
      return;
    }

    if (newEmail === currentEmail) {
      setEmailMessage({
        type: 'error',
        text: 'O novo email deve ser diferente do atual.',
      });
      return;
    }

    setLoadingEmail(true);
    setEmailMessage(null);

    try {
      const { data, error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      if (data?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ email: newEmail })
          .eq('id', data.user.id);

        if (profileError) {
          logger.error('Erro ao atualizar profile:', profileError);
        }

        setEmailMessage({
          type: 'info',
          text: 'Enviamos um link de confirmação para o novo email.',
        });
        setNewEmail('');
      }
    } catch (error: any) {
      logger.error('Erro ao alterar email:', error);
      setEmailMessage({
        type: 'error',
        text: error.message || 'Erro ao alterar email. Tente novamente.',
      });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage({
        type: 'error',
        text: 'A senha deve ter no mínimo 6 caracteres.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    setLoadingPassword(true);
    setPasswordMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (error: any) {
      logger.error('Erro ao alterar senha:', error);
      setPasswordMessage({
        type: 'error',
        text: error.message || 'Erro ao alterar senha. Tente novamente.',
      });
    } finally {
      setLoadingPassword(false);
    }
  };

  const MessageBox = ({
    message,
  }: {
    message: { type: 'success' | 'error' | 'info'; text: string };
  }) => (
    <div
      className={`mb-4 rounded-2xl border p-4 ${
        message.type === 'success'
          ? 'border-green-200 bg-green-50'
          : message.type === 'error'
          ? 'border-red-200 bg-red-50'
          : 'border-blue-200 bg-blue-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {message.type === 'success' ? (
          <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
        ) : (
          <AlertCircle
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
              message.type === 'error' ? 'text-red-600' : 'text-blue-600'
            }`}
          />
        )}

        <p
          className={`text-sm ${
            message.type === 'success'
              ? 'text-green-800'
              : message.type === 'error'
              ? 'text-red-800'
              : 'text-blue-800'
          }`}
        >
          {message.text}
        </p>
      </div>
    </div>
  );

  const getRoleLabel = (role: string | null) => {
    if (!role) return 'Não atribuído';

    const roles: Record<string, string> = {
      owner: 'Proprietário',
      manager: 'Gerente',
      staff: 'Equipe',
      super_admin: 'Super Administrador',
    };

    return roles[role] || role;
  };

  const displayRole = () => {
    if (isSuperAdmin && !isSupportMode) {
      return 'Super Administrador';
    }

    if (isSupportMode) {
      return `${getRoleLabel(effectiveUserRole)} (Modo Suporte)`;
    }

    return getRoleLabel(effectiveUserRole);
  };

  return (
    <div className="w-full max-w-4xl space-y-6 pb-4">
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-r from-red-50 via-white to-orange-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/80 px-3 py-1 text-xs font-semibold text-red-600 backdrop-blur">
              <UserCircle className="h-4 w-4" />
              Conta e Segurança
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Minha Conta
            </h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">
              Gerencie suas informações pessoais e suas credenciais de acesso.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Função atual
              </div>
              <div className="mt-2 text-base font-bold text-gray-900">{displayRole()}</div>
            </div>
            <div className="rounded-2xl bg-purple-50 p-3 text-purple-600">
              <Crown className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Loja vinculada
              </div>
              <div className="mt-2 text-base font-bold text-gray-900">
                {store?.name || 'Nenhuma loja vinculada'}
              </div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
              <Store className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status
              </div>
              <div className="mt-2 text-base font-bold text-green-600">Conta ativa</div>
            </div>
            <div className="rounded-2xl bg-green-50 p-3 text-green-600">
              <BadgeCheck className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600">
              <UserCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Informações do Perfil</h2>
              <p className="text-sm text-gray-600">Visualize seus dados básicos</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Email Atual
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={currentEmail}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-gray-700"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Função</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Shield className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={displayRole()}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-gray-700"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Loja Vinculada
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Store className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={store?.name || 'Nenhuma loja vinculada'}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-gray-700"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Dados Pessoais</h2>
              <p className="text-sm text-gray-600">Atualize seu nome completo</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {nameMessage && <MessageBox message={nameMessage} />}

          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loadingName || !fullName.trim()}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingName ? 'Salvando...' : 'Salvar Nome'}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600">
              <Mail className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Alterar Email</h2>
              <p className="text-sm text-gray-600">Atualize seu email de acesso</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {emailMessage && <MessageBox message={emailMessage} />}

          <form onSubmit={handleChangeEmail} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Novo Email
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="seu-novo-email@exemplo.com"
                  className="w-full rounded-2xl border border-gray-200 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Você receberá um link de confirmação no novo email.
              </p>
            </div>

            <button
              type="submit"
              disabled={loadingEmail || !newEmail}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingEmail ? 'Alterando...' : 'Alterar Email'}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-600">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Alterar Senha</h2>
              <p className="text-sm text-gray-600">Atualize sua senha de acesso</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {passwordMessage && <MessageBox message={passwordMessage} />}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Nova Senha
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-2xl border border-gray-200 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Digite a senha novamente"
                  className="w-full rounded-2xl border border-gray-200 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingPassword || !newPassword || !confirmPassword}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-red-50 to-rose-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Segurança</h2>
              <p className="text-sm text-gray-600">Gerencie a segurança da sua conta</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="mb-4 text-gray-600">
            Para proteger sua conta, você pode sair do sistema a qualquer momento.
          </p>

          <button
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            <LogOut className="h-5 w-5" />
            Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
}
