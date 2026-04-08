import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, AlertCircle, CheckCircle, Lock, Shield, LogOut, Store, CircleUser as UserCircle } from 'lucide-react';
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

  const [nameMessage, setNameMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadCurrentUser();
  }, [profile]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();
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
        text: error.message || 'Erro ao atualizar nome. Tente novamente.'
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
      setEmailMessage({ type: 'error', text: 'O novo email deve ser diferente do atual.' });
      return;
    }

    setLoadingEmail(true);
    setEmailMessage(null);

    try {
      const { data, error } = await supabase.auth.updateUser({
        email: newEmail
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
          text: 'Enviamos um link de confirmação para o novo email.'
        });
        setNewEmail('');
      }
    } catch (error: any) {
      logger.error('Erro ao alterar email:', error);
      setEmailMessage({
        type: 'error',
        text: error.message || 'Erro ao alterar email. Tente novamente.'
      });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'A senha deve ter no mínimo 6 caracteres.' });
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
        password: newPassword
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
        text: error.message || 'Erro ao alterar senha. Tente novamente.'
      });
    } finally {
      setLoadingPassword(false);
    }
  };

  const MessageBox = ({ message }: { message: { type: 'success' | 'error' | 'info'; text: string } }) => (
    <div className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${
      message.type === 'success' ? 'bg-green-50 border border-green-200' :
      message.type === 'error' ? 'bg-red-50 border border-red-200' :
      'bg-blue-50 border border-blue-200'
    }`}>
      {message.type === 'success' ? (
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
          message.type === 'error' ? 'text-red-600' : 'text-blue-600'
        }`} />
      )}
      <p className={`text-sm ${
        message.type === 'success' ? 'text-green-800' :
        message.type === 'error' ? 'text-red-800' :
        'text-blue-800'
      }`}>
        {message.text}
      </p>
    </div>
  );

  const getRoleLabel = (role: string | null) => {
    if (!role) return 'Não atribuído';

    const roles: Record<string, string> = {
      owner: 'Proprietário',
      manager: 'Gerente',
      staff: 'Equipe',
      super_admin: 'Super Administrador'
    };
    return roles[role] || role;
  };

  // CRITICAL: Display correct role based on context
  const displayRole = () => {
    if (isSuperAdmin && !isSupportMode) {
      return 'Super Administrador';
    }

    if (isSupportMode) {
      return `${getRoleLabel(effectiveUserRole)} (Modo Suporte)`;
    }

    // Regular store user - show their store role
    return getRoleLabel(effectiveUserRole);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Minha Conta</h1>
        <p className="text-gray-600">Gerencie suas informações pessoais e configurações de acesso</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Informações do Perfil</h2>
              <p className="text-sm text-gray-600">Visualize seus dados básicos</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Atual
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={currentEmail}
                disabled
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Função
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Shield className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={displayRole()}
                disabled
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Loja Vinculada
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Store className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={store?.name || 'Nenhuma loja vinculada'}
                disabled
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loadingName || !fullName.trim()}
              className="w-full bg-primary hover:opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingName ? 'Salvando...' : 'Salvar Nome'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Novo Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="seu-novo-email@exemplo.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingEmail ? 'Alterando...' : 'Alterar Email'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-600 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Digite a senha novamente"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingPassword || !newPassword || !confirmPassword}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Segurança</h2>
              <p className="text-sm text-gray-600">Gerencie a segurança da sua conta</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-4">
            Para proteger sua conta, você pode sair do sistema a qualquer momento.
          </p>
          <button
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
}
