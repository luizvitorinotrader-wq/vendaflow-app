import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { logAuditEvent } from '../lib/auditLogger';
import { logger } from '../lib/logger';
import { getEffectivePlan } from '../lib/effectivePlan';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Store = Database['public']['Tables']['stores']['Row'];
type SupportSession = Database['public']['Tables']['admin_support_sessions']['Row'];

type UserRole = 'owner' | 'manager' | 'staff' | null;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  store: Store | null;
  session: Session | null;
  loading: boolean;
  hasValidStore: boolean;
  isSubscriptionBlocked: boolean;
  isSystemAdmin: boolean;
  isSuperAdmin: boolean;
  supportSession: SupportSession | null;
  isSupportMode: boolean;
  userRole: UserRole;
  effectiveUserRole: UserRole;
  storeId: string | null;
  effectivePlan: 'starter' | 'pro' | 'premium';
  isOwner: boolean;
  isManager: boolean;
  isStaff: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, fullName: string, storeName: string, phone: string, city: string, captchaToken?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  startSupportMode: (targetStoreId: string) => Promise<void>;
  endSupportMode: () => Promise<void>;
  switchSupportStore: (targetStoreId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasValidStore, setHasValidStore] = useState(false);
  const [isSubscriptionBlocked, setIsSubscriptionBlocked] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);
  const [isSupportMode, setIsSupportMode] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  const checkSubscriptionStatus = (store: Store): boolean => {
    logger.log('Verificando status da assinatura...');
    logger.log('Status da assinatura:', store.subscription_status);
    logger.log('Plano encontrado:', store.plan_name || store.plan);

    if (store.is_blocked) {
      logger.log('Acesso bloqueado: loja está bloqueada manualmente');
      return true;
    }

    if (store.subscription_status === 'cancelled' || store.subscription_status === 'overdue') {
      logger.log('Acesso bloqueado: assinatura cancelada ou vencida');
      return true;
    }

    if (store.subscription_status === 'active') {
      logger.log('Acesso liberado: assinatura ativa');
      return false;
    }

    if (store.subscription_status === 'trial') {
      if (store.trial_ends_at) {
        const trialEnds = new Date(store.trial_ends_at);
        const now = new Date();

        if (trialEnds >= now) {
          logger.log('Acesso liberado: período de teste ativo');
          return false;
        } else {
          logger.log('Acesso bloqueado: período de teste expirado');
          return true;
        }
      } else {
        logger.log('Acesso liberado: trial sem data de expiração definida');
        return false;
      }
    }

    logger.log('Acesso bloqueado: status de assinatura desconhecido');
    return true;
  };

  type TimedQueryResult<T> = {
    data: T | null;
    error: any;
    durationMs: number;
    timedOut: boolean;
  };

  const timedQuery = async <T,>(
    queryName: string,
    queryFn: () => Promise<{ data: T | null; error: any }>,
    timeoutMs: number = 2500
  ): Promise<TimedQueryResult<T>> => {
    const startTime = Date.now();
    logger.log(`[AuthDiag] START ${queryName}`);

    try {
      const result = await Promise.race([
        queryFn(),
        new Promise<{ data: null; error: any; timedOut: true }>((_, reject) =>
          setTimeout(() => {
            reject(new Error(`Query timeout: ${queryName}`));
          }, timeoutMs)
        )
      ]);

      const durationMs = Date.now() - startTime;
      const found = result.data !== null && result.data !== undefined;
      const status = result.error ? 'failure' : 'success';
      const dataStatus = found ? 'found' : 'not_found';

      logger.log(`[AuthDiag] END ${queryName} - ${durationMs}ms - ${status} - ${dataStatus}`);

      return {
        data: result.data,
        error: result.error,
        durationMs,
        timedOut: false
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.log(`[AuthDiag] END ${queryName} - ${durationMs}ms - timeout - not_found`);

      return {
        data: null,
        error: error,
        durationMs,
        timedOut: true
      };
    }
  };

  const continueProfileSetup = async (data: Profile, userId: string) => {
    logger.log('👤 [fetchProfile] Profile data:', { id: data.id, email: data.email, store_id: data.store_id, role: data.role, is_system_admin: data.is_system_admin });
    setProfile(data);

    const diagnosticResults: Record<string, { duration: number; status: string; timedOut: boolean }> = {};

    // Set super admin status from profiles.role
    const isSuperAdminUser = data.role === 'super_admin';
    logger.log('🔐 [fetchProfile] Super admin status:', isSuperAdminUser);
    setIsSuperAdmin(isSuperAdminUser);

    // Set system admin status from profiles.is_system_admin (legacy, will be deprecated)
    const isSystemAdminUser = data.is_system_admin || false;
    logger.log('🔐 [fetchProfile] System admin status (legacy):', isSystemAdminUser);
    setIsSystemAdmin(isSystemAdminUser);

    let currentStoreId: string | null = null;

    logger.log('🔍 [fetchProfile] Checking for active support session...');
    const supportSessionResult = await timedQuery(
      'admin_support_sessions',
      () => supabase
        .from('admin_support_sessions')
        .select('*')
        .eq('admin_user_id', userId)
        .eq('is_active', true)
        .maybeSingle(),
      2500
    );

    diagnosticResults.admin_support_sessions = {
      duration: supportSessionResult.durationMs,
      status: supportSessionResult.error ? 'error' : 'success',
      timedOut: supportSessionResult.timedOut
    };

    if (supportSessionResult.error && !supportSessionResult.timedOut) {
      logger.log('⚠️ [fetchProfile] Support session query error (ignored):', supportSessionResult.error.message);
    }

    if (supportSessionResult.timedOut) {
      logger.log('⚠️ [fetchProfile] Support session query timed out (continuing without support mode)');
    }

    const activeSupportSession = supportSessionResult.data;

    if (activeSupportSession) {
      logger.log('🛠️ [fetchProfile] Support mode active for store:', activeSupportSession.target_store_id);
      setSupportSession(activeSupportSession);
      setIsSupportMode(true);
      currentStoreId = activeSupportSession.target_store_id;

      const targetStoreResult = await timedQuery(
        'stores_target_support',
        () => supabase
          .from('stores')
          .select('*')
          .eq('id', activeSupportSession.target_store_id)
          .maybeSingle(),
        2500
      );

      diagnosticResults.stores_target_support = {
        duration: targetStoreResult.durationMs,
        status: targetStoreResult.error ? 'error' : 'success',
        timedOut: targetStoreResult.timedOut
      };

      if (targetStoreResult.error && !targetStoreResult.timedOut) {
        logger.log('⚠️ [fetchProfile] Target store query error (ignored):', targetStoreResult.error.message);
      }

      if (targetStoreResult.timedOut) {
        logger.log('⚠️ [fetchProfile] Target store query timed out (continuing with null store)');
      }

      if (targetStoreResult.data) {
        logger.log('🏪 [fetchProfile] Target store loaded:', targetStoreResult.data.name);
        setStore(targetStoreResult.data);
        setHasValidStore(true);
        const blocked = checkSubscriptionStatus(targetStoreResult.data);
        setIsSubscriptionBlocked(blocked);
      } else {
        logger.log('⚠️ [fetchProfile] Target store not found');
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
      }
    } else if (data.store_id) {
      currentStoreId = data.store_id;
      logger.log('🏪 [fetchProfile] Loading user store:', data.store_id);

      const storeDataResult = await timedQuery(
        'stores_user_store',
        () => supabase
          .from('stores')
          .select('*')
          .eq('id', data.store_id)
          .maybeSingle(),
        2500
      );

      diagnosticResults.stores_user_store = {
        duration: storeDataResult.durationMs,
        status: storeDataResult.error ? 'error' : 'success',
        timedOut: storeDataResult.timedOut
      };

      if (storeDataResult.error && !storeDataResult.timedOut) {
        logger.log('⚠️ [fetchProfile] Store query error (ignored):', storeDataResult.error.message);
      }

      if (storeDataResult.timedOut) {
        logger.log('⚠️ [fetchProfile] Store query timed out (continuing with null store)');
      }

      if (storeDataResult.data) {
        logger.log('✅ [fetchProfile] Store loaded:', storeDataResult.data.name);
        setStore(storeDataResult.data);
        setHasValidStore(true);

        const blocked = checkSubscriptionStatus(storeDataResult.data);
        setIsSubscriptionBlocked(blocked);
      } else {
        logger.log('⚠️ [fetchProfile] Store ID exists but store not found');
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
      }
    } else {
      // No store_id - check if super_admin or regular user
      if (isSuperAdminUser) {
        logger.log('👑 [fetchProfile] Super admin with no store_id (expected)');
        setStore(null);
        setHasValidStore(true); // Super admin doesn't need a store
        setIsSubscriptionBlocked(false);
        setUserRole(null);
        setStoreId(null);
      } else {
        logger.log('ℹ️ [fetchProfile] User without store → redirect to setup');
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
        setUserRole(null);
        setStoreId(null);
      }

      logger.log('[AuthDiag] continueProfileSetup completed');
      logger.log('[AuthDiag] Diagnostic summary:', diagnosticResults);
      return data;
    }

    setStoreId(currentStoreId);

    // Fetch role from store_users
    if (currentStoreId) {
      // SUPPORT MODE OVERRIDE: Super admin in support mode gets owner-level access
      if (isSuperAdminUser && activeSupportSession) {
        logger.log('👑 [fetchProfile] Super admin in support mode → granting owner role');
        setUserRole('owner');
      } else {
        logger.log('🔍 [fetchProfile] Fetching user role for store:', currentStoreId);

        const storeUserRoleResult = await timedQuery(
          'store_users_fetch_role',
          () => supabase
            .from('store_users')
            .select('role')
            .eq('user_id', userId)
            .eq('store_id', currentStoreId)
            .eq('is_active', true)
            .maybeSingle(),
          2500
        );

        diagnosticResults.store_users_fetch_role = {
          duration: storeUserRoleResult.durationMs,
          status: storeUserRoleResult.error ? 'error' : 'success',
          timedOut: storeUserRoleResult.timedOut
        };

        if (storeUserRoleResult.error && !storeUserRoleResult.timedOut) {
          logger.log('⚠️ [fetchProfile] Role query failed (proceeding with null role):', storeUserRoleResult.error.message);
          setUserRole(null);
        } else if (storeUserRoleResult.timedOut) {
          logger.log('⚠️ [fetchProfile] Role query timed out (continuing with null role)');
          setUserRole(null);
        } else if (storeUserRoleResult.data) {
          const role = storeUserRoleResult.data.role as UserRole;
          logger.log('✅ [fetchProfile] Store role:', role);
          setUserRole(role);
        } else {
          logger.log('⚠️ [fetchProfile] No store_users record found (may need migration)');
          setUserRole(null);
        }
      }
    } else {
      logger.log('ℹ️ [fetchProfile] No currentStoreId → role set to null');
      setUserRole(null);
    }

    logger.log('[AuthDiag] continueProfileSetup completed');
    logger.log('[AuthDiag] Diagnostic summary:', diagnosticResults);
    logger.log('✅ [fetchProfile] Profile fetch completed successfully');
    console.log('[Auth] fetchProfile COMPLETE - profile loaded');
    return data;
  };

  const fetchProfile = async (userId: string, attemptNumber: number = 1): Promise<Profile | null> => {
    const maxAttempts = 3;
    logger.log(`🔍 [fetchProfile] Starting profile fetch for user: ${userId} (attempt ${attemptNumber}/${maxAttempts})`);
    console.log(`[Auth] fetchProfile START for userId: ${userId} (attempt ${attemptNumber}/${maxAttempts})`);

    try {
      logger.log('📡 [fetchProfile] Fetching profile from database...');
      console.log('[Auth] Querying profiles table...');

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      console.log('[Auth] Profile query result:', { data: !!data, error: !!profileError });

      if (profileError) {
        logger.error(`❌ [fetchProfile] Error fetching profile (attempt ${attemptNumber}):`, profileError);
        console.error('[Auth] Profile query error:', profileError);

        // Retry logic for transient errors
        if (attemptNumber < maxAttempts && (
          profileError.message?.includes('timeout') ||
          profileError.message?.includes('network') ||
          profileError.message?.includes('fetch')
        )) {
          const delayMs = attemptNumber * 1000;
          logger.log(`⏳ [fetchProfile] Retrying in ${delayMs}ms...`);
          console.log(`[Auth] Retrying fetchProfile in ${delayMs}ms (${attemptNumber}/${maxAttempts})`);

          await new Promise(resolve => setTimeout(resolve, delayMs));
          return fetchProfile(userId, attemptNumber + 1);
        }

        // If error is "not found", try to create profile
        if (profileError.code === 'PGRST116') {
          logger.log('🔧 [fetchProfile] Profile not found, creating automatically...');
          console.log('[Auth] Creating missing profile for user:', userId);

          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              email: (await supabase.auth.getUser()).data.user?.email || '',
              role: 'user',
            });

          if (insertError) {
            logger.error('❌ [fetchProfile] Failed to auto-create profile:', insertError);
            console.error('[Auth] Profile creation failed:', insertError);
          } else {
            logger.log('✅ [fetchProfile] Profile auto-created, fetching again...');
            console.log('[Auth] Profile created successfully, retrying fetch...');

            const { data: newProfile, error: retryError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();

            if (!retryError && newProfile) {
              logger.log('✅ [fetchProfile] New profile loaded successfully');
              console.log('[Auth] New profile loaded');
              return await continueProfileSetup(newProfile, userId);
            }
          }
        }

        // Fatal error - clear state
        setProfile(null);
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
        setIsSystemAdmin(false);
        setIsSuperAdmin(false);
        setUserRole(null);
        setStoreId(null);
        console.log('[Auth] Profile set to null due to error');
        return null;
      }

      logger.log('✅ [fetchProfile] Profile query completed. Found:', !!data);
      console.log('[Auth] Profile found:', !!data);

      if (data) {
        return await continueProfileSetup(data, userId);
      } else {
        logger.log('⚠️ [fetchProfile] No profile found in database');
        console.log('[Auth] No profile found, setting all to null');
        setProfile(null);
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
        setIsSystemAdmin(false);
        setIsSuperAdmin(false);
        setUserRole(null);
        setStoreId(null);
        console.log('[Auth] fetchProfile COMPLETE - no profile');
        return null;
      }
    } catch (error) {
      logger.error(`❌ [fetchProfile] Fatal error (attempt ${attemptNumber}):`, error);
      console.error('[Auth] fetchProfile FATAL ERROR:', error);

      // Retry logic for unexpected errors
      if (attemptNumber < maxAttempts) {
        const delayMs = attemptNumber * 1000;
        logger.log(`⏳ [fetchProfile] Retrying in ${delayMs}ms after fatal error...`);
        console.log(`[Auth] Retrying fetchProfile in ${delayMs}ms (${attemptNumber}/${maxAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delayMs));
        return fetchProfile(userId, attemptNumber + 1);
      }

      // Final failure - clear state
      setProfile(null);
      setStore(null);
      setHasValidStore(false);
      setIsSubscriptionBlocked(false);
      setIsSystemAdmin(false);
      setIsSuperAdmin(false);
      setUserRole(null);
      setStoreId(null);

      console.log('[Auth] fetchProfile COMPLETE - error handled');
      return null;
    }
  };

  const fetchProfileWithTimeout = async (userId: string, timeoutMs: number = 15000): Promise<Profile | null> => {
    logger.log(`⏱️ [fetchProfileWithTimeout] Starting with ${timeoutMs}ms timeout`);
    console.log(`[Auth] fetchProfileWithTimeout: ${timeoutMs}ms timeout for user ${userId}`);

    return Promise.race([
      fetchProfile(userId),
      new Promise<null>((_, reject) =>
        setTimeout(() => {
          logger.error('⏰ [fetchProfileWithTimeout] TIMEOUT REACHED');
          console.error(`[Auth] fetchProfile TIMEOUT after ${timeoutMs}ms`);
          reject(new Error('fetchProfile timeout'));
        }, timeoutMs)
      )
    ]).catch(async (error) => {
      logger.error('❌ [fetchProfileWithTimeout] Error or timeout:', error.message);
      console.error('[Auth] fetchProfileWithTimeout caught error:', error.message);

      // Garantir fallback seguro em caso de timeout
      setProfile(null);
      setStore(null);
      setHasValidStore(false);
      setIsSubscriptionBlocked(false);
      setIsSystemAdmin(false);
      setIsSuperAdmin(false);
      setUserRole(null);
      setStoreId(null);

      // CRITICAL: Force logout on persistent failure
      console.error('[Auth] CRITICAL: Profile fetch failed after all retries. Forcing logout for safety.');
      logger.error('🚨 [fetchProfileWithTimeout] Profile fetch failed - forcing logout');

      // Wait a bit to allow state to clear
      await new Promise(resolve => setTimeout(resolve, 500));

      // Force logout
      await supabase.auth.signOut();
      window.location.href = '/login';

      return null;
    });
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;
    let fetchProfileInProgress = false;
    let lastFetchedUserId: string | null = null;

    const initializeAuth = async () => {
      logger.log('🚀 [initializeAuth] Starting authentication initialization...');

      const failSafeTimeout = setTimeout(() => {
        if (mounted) {
          logger.log('⚠️ [initializeAuth] Fail-safe timeout triggered, forcing loading=false');
          setLoading(false);
        }
      }, 10000);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) {
          logger.log('⚠️ [initializeAuth] Component unmounted, aborting');
          clearTimeout(failSafeTimeout);
          return;
        }

        logger.log('✅ [initializeAuth] Session retrieved:', !!session);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          logger.log('👤 [initializeAuth] User found, fetching profile...');
          console.log('[Auth] Profile loading for user:', session.user.id);
          const profileResult = await fetchProfileWithTimeout(session.user.id, 15000);

          if (profileResult === null) {
            logger.log('⚠️ [initializeAuth] Profile fetch returned null (timeout or error)');
            console.log('[Auth] initializeAuth: Profile fetch failed/timeout - user will be logged out');
          } else {
            console.log('[Auth] Profile loaded successfully:', {
              id: profileResult.id,
              email: profileResult.email,
              role: profileResult.role,
              store_id: profileResult.store_id
            });
          }
        } else {
          logger.log('ℹ️ [initializeAuth] No active session');
        }
      } catch (error) {
        logger.error('❌ [initializeAuth] Fatal error:', error);

        // Garantir estado limpo em caso de erro
        if (mounted) {
          setProfile(null);
          setStore(null);
          setHasValidStore(false);
          setIsSubscriptionBlocked(false);
          setIsSystemAdmin(false);
          setIsSuperAdmin(false);
          setUserRole(null);
          setStoreId(null);
        }
      } finally {
        clearTimeout(failSafeTimeout);
        if (mounted) {
          logger.log('✅ [initializeAuth] Setting loading=false');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        logger.log('⚠️ [onAuthStateChange] Component unmounted, ignoring event:', event);
        return;
      }

      logger.log('🔄 [onAuthStateChange] Event:', event);

      if (event === 'SIGNED_OUT') {
        logger.log('👋 [onAuthStateChange] User signed out, clearing state');
        setSession(null);
        setUser(null);
        setProfile(null);
        setStore(null);
        setHasValidStore(false);
        setIsSubscriptionBlocked(false);
        setIsSystemAdmin(false);
        setIsSuperAdmin(false);
        setUserRole(null);
        setStoreId(null);
        setSupportSession(null);
        setIsSupportMode(false);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        logger.log('🔐 [onAuthStateChange] Auth event detected, fetching profile...');
        console.log('[Auth] onAuthStateChange event:', event, 'User ID:', session?.user?.id);

        const userId = session?.user?.id;

        // Skip if already fetching for the same user
        if (fetchProfileInProgress && lastFetchedUserId === userId) {
          logger.log('⏭️ [onAuthStateChange] Skipping duplicate fetchProfile for user:', userId);
          console.log('[Auth] SKIP: fetchProfile already in progress for this user');
          return;
        }

        // Use async block inside callback to avoid deadlock
        (async () => {
          try {
            fetchProfileInProgress = true;
            lastFetchedUserId = userId || null;

            setLoading(true);
            console.log('[Auth] Setting loading=true');
            setSession(session);
            console.log('[Auth] Session set');
            setUser(session?.user ?? null);
            console.log('[Auth] User set:', !!session?.user);

            if (session?.user) {
              console.log('[Auth] Fetching profile for user:', session.user.id);
              console.log('[Auth] Profile loading...');
              const profileResult = await fetchProfileWithTimeout(session.user.id, 15000);

              if (profileResult === null) {
                logger.log('⚠️ [onAuthStateChange] Profile fetch returned null (timeout or error)');
                console.log('[Auth] Profile fetch failed/timeout - user will be logged out for safety');
              } else {
                console.log('[Auth] Profile loaded:', {
                  id: profileResult.id,
                  email: profileResult.email,
                  role: profileResult.role,
                  store_id: profileResult.store_id,
                  is_system_admin: profileResult.is_system_admin
                });
              }
            } else {
              console.log('[Auth] No user in session, skipping profile fetch');
            }
          } catch (error) {
            logger.error('❌ [onAuthStateChange] Error handling auth change:', error);
            console.error('[Auth] Error in onAuthStateChange:', error);

            // Garantir estado limpo em caso de erro
            setProfile(null);
            setStore(null);
            setHasValidStore(false);
            setIsSubscriptionBlocked(false);
            setIsSystemAdmin(false);
            setIsSuperAdmin(false);
            setUserRole(null);
            setStoreId(null);
          } finally {
            fetchProfileInProgress = false;
            logger.log('✅ [onAuthStateChange] Setting loading=false');
            console.log('[Auth] Setting loading=false');
            setLoading(false);
          }
        })();
      }
    });

    return () => {
      logger.log('🧹 [useEffect cleanup] Unmounting AuthProvider');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string, captchaToken?: string): Promise<{ success: boolean; error?: string }> => {
    logger.log('🔐 [signIn] Attempting login for:', email);

    try {
      // Validate Turnstile token on backend before proceeding with login
      if (captchaToken) {
        logger.log('🔒 [signIn] Validating Turnstile token on backend...');

        try {
          const verifyResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-turnstile`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ token: captchaToken }),
            }
          );

          const verifyResult = await verifyResponse.json();

          if (!verifyResult.success) {
            logger.error('❌ [signIn] Turnstile validation failed');

            await logAuditEvent({
              eventType: 'login_failed',
              eventStatus: 'failure',
              metadata: { email, errorMessage: 'Turnstile validation failed' },
            });

            return {
              success: false,
              error: 'Verificação de segurança falhou. Tente novamente.',
            };
          }

          logger.log('✅ [signIn] Turnstile validation successful');
        } catch (verifyError) {
          logger.error('❌ [signIn] Error validating Turnstile:', verifyError);

          await logAuditEvent({
            eventType: 'login_failed',
            eventStatus: 'failure',
            metadata: { email, errorMessage: 'Turnstile verification error' },
          });

          return {
            success: false,
            error: 'Erro ao verificar segurança. Verifique sua conexão e tente novamente.',
          };
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined
      });

      if (error) {
        logger.error('❌ [signIn] Login failed:', error.message);

        await logAuditEvent({
          eventType: 'login_failed',
          eventStatus: 'failure',
          metadata: { email, errorMessage: error.message },
        });

        if (error.message.includes('Invalid login credentials')) {
          return {
            success: false,
            error: 'E-mail ou senha inválidos.',
          };
        }

        if (error.message.includes('Email not confirmed')) {
          return {
            success: false,
            error: 'E-mail não confirmado. Verifique sua caixa de entrada.',
          };
        }

        if (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network')) {
          return {
            success: false,
            error: 'Erro de conexão. Verifique sua internet e tente novamente.',
          };
        }

        return {
          success: false,
          error: 'Não foi possível entrar agora. Tente novamente.',
        };
      }

      if (!data.user) {
        logger.error('❌ [signIn] No user returned from signInWithPassword');
        return {
          success: false,
          error: 'Não foi possível entrar agora. Tente novamente.',
        };
      }

      logger.log('✅ [signIn] Login successful for user:', data.user.id);

      await logAuditEvent({
        userId: data.user.id,
        eventType: 'login_success',
        eventStatus: 'success',
        metadata: { email },
      });

      return { success: true };

    } catch (err) {
      logger.error('❌ [signIn] Unexpected error:', err);

      await logAuditEvent({
        eventType: 'login_failed',
        eventStatus: 'failure',
        metadata: { email, errorMessage: 'Unexpected error' },
      });

      if (err instanceof Error && err.message.toLowerCase().includes('fetch')) {
        return {
          success: false,
          error: 'Erro de conexão. Verifique sua internet e tente novamente.',
        };
      }

      return {
        success: false,
        error: 'Não foi possível entrar agora. Tente novamente.',
      };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, storeName: string, phone: string, city: string, captchaToken?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined
    });

    if (data.user && !error) {
      try {
        const { data: store, error: storeError } = await supabase
          .from('stores')
          .insert({
            name: storeName,
            owner_id: data.user.id,
            phone,
            address: city,
            plan: 'starter',
          })
          .select()
          .single();

        if (storeError) throw storeError;

        await supabase.from('profiles').insert({
          id: data.user.id,
          email,
          full_name: fullName,
          store_id: store.id,
          role: 'owner',
        });

        await logAuditEvent({
          userId: data.user.id,
          eventType: 'signup_success',
          eventStatus: 'success',
          metadata: { email, storeName },
        });
      } catch (err) {
        await logAuditEvent({
          eventType: 'signup_failed',
          eventStatus: 'failure',
          metadata: { email, errorMessage: 'Failed to create store or profile' },
        });
        return { error: err as Error };
      }
    } else if (error) {
      await logAuditEvent({
        eventType: 'signup_failed',
        eventStatus: 'failure',
        metadata: { email, errorMessage: error.message },
      });
    }

    return { error };
  };

  const startSupportMode = async (targetStoreId: string) => {
    if (!user || (!isSystemAdmin && !isSuperAdmin)) {
      logger.error('Apenas administradores do sistema podem iniciar modo suporte');
      throw new Error('Permissão negada');
    }

    logger.log('🛠️ [startSupportMode] Iniciando modo suporte para loja:', targetStoreId);
    const { data: sessionData, error: sessionError } = await supabase
      .from('admin_support_sessions')
      .insert({
        admin_user_id: user.id,
        target_store_id: targetStoreId,
        is_active: true,
      })
      .select()
      .single();

    if (sessionError || !sessionData) {
      logger.error('❌ [startSupportMode] Erro ao criar sessão:', sessionError);
      throw sessionError || new Error('Falha ao criar sessão de suporte');
    }

    logger.log('✅ [startSupportMode] Sessão de suporte criada:', sessionData.id);

    // Atualizar support_mode_store_id no banco de dados
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ support_mode_store_id: targetStoreId })
      .eq('id', user.id);

    if (profileUpdateError) {
      logger.error('❌ [startSupportMode] Erro ao atualizar profile:', profileUpdateError);
      throw profileUpdateError;
    }

    logger.log('✅ [startSupportMode] support_mode_store_id atualizado no banco');

    // Buscar a loja alvo
    const { data: targetStore, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', targetStoreId)
      .maybeSingle();

    if (storeError || !targetStore) {
      logger.error('❌ [startSupportMode] Erro ao buscar loja alvo:', storeError);
      throw storeError || new Error('Loja não encontrada');
    }

    logger.log('✅ [startSupportMode] Loja alvo carregada:', targetStore.name);

    // Atualizar estados manualmente (sem race condition)
    setSupportSession(sessionData);
    setIsSupportMode(true);
    setStore(targetStore);
    setStoreId(targetStoreId);
    setHasValidStore(true);
    setUserRole(null); // Super admin em modo suporte não tem role
    const blocked = checkSubscriptionStatus(targetStore);
    setIsSubscriptionBlocked(blocked);

    logger.log('✅ [startSupportMode] Estados atualizados, modo suporte ativo');

    // Log audit trail
    const { logSuperAdminAction } = await import('../lib/superAdminAudit');
    await logSuperAdminAction({
      store_id: targetStoreId,
      action_type: 'start_support_mode',
      notes: `Iniciou modo suporte para loja: ${targetStore.name}`,
    });

    logger.log('✅ [startSupportMode] Auditoria registrada');
  };

  const endSupportMode = async () => {
    if (!supportSession || !user) {
      logger.log('⚠️ [endSupportMode] Nenhuma sessão de suporte ativa');
      return;
    }

    logger.log('🛠️ [endSupportMode] Encerrando modo suporte...');

    const targetStoreId = supportSession.target_store_id;

    // Marcar sessão como encerrada
    await supabase
      .from('admin_support_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      })
      .eq('id', supportSession.id);

    // Limpar support_mode_store_id no banco de dados
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ support_mode_store_id: null })
      .eq('id', user.id);

    if (profileUpdateError) {
      logger.error('❌ [endSupportMode] Erro ao limpar profile:', profileUpdateError);
      // Não lançar erro, continuar com limpeza
    }

    logger.log('✅ [endSupportMode] support_mode_store_id limpo no banco');

    const { logSuperAdminAction } = await import('../lib/superAdminAudit');
    await logSuperAdminAction({
      store_id: targetStoreId,
      action_type: 'end_support_mode',
      notes: 'Modo suporte encerrado',
    });

    setSupportSession(null);
    setIsSupportMode(false);

    logger.log('✅ [endSupportMode] Modo suporte encerrado, redirecionando...');
    await fetchProfile(user.id);

    window.location.href = '/app/super-admin';
  };

  const switchSupportStore = async (targetStoreId: string) => {
    if (!user || (!isSystemAdmin && !isSuperAdmin) || !isSupportMode || !supportSession) {
      logger.error('Apenas administradores em modo suporte podem trocar de loja');
      throw new Error('Permissão negada');
    }

    logger.log('🔄 [switchSupportStore] Trocando para loja:', targetStoreId);

    // Encerrar sessão atual
    await supabase
      .from('admin_support_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      })
      .eq('id', supportSession.id);

    logger.log('✅ [switchSupportStore] Sessão anterior encerrada');

    // Criar nova sessão
    const { data: newSessionData, error: sessionError } = await supabase
      .from('admin_support_sessions')
      .insert({
        admin_user_id: user.id,
        target_store_id: targetStoreId,
        is_active: true,
      })
      .select()
      .single();

    if (sessionError || !newSessionData) {
      logger.error('❌ [switchSupportStore] Erro ao criar nova sessão:', sessionError);
      throw sessionError || new Error('Falha ao criar sessão de suporte');
    }

    logger.log('✅ [switchSupportStore] Nova sessão criada:', newSessionData.id);

    // Atualizar support_mode_store_id no banco
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ support_mode_store_id: targetStoreId })
      .eq('id', user.id);

    if (profileUpdateError) {
      logger.error('❌ [switchSupportStore] Erro ao atualizar profile:', profileUpdateError);
      throw profileUpdateError;
    }

    logger.log('✅ [switchSupportStore] support_mode_store_id atualizado');

    // Buscar nova loja
    const { data: targetStore, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', targetStoreId)
      .maybeSingle();

    if (storeError || !targetStore) {
      logger.error('❌ [switchSupportStore] Erro ao buscar loja:', storeError);
      throw storeError || new Error('Loja não encontrada');
    }

    logger.log('✅ [switchSupportStore] Nova loja carregada:', targetStore.name);

    // Atualizar estados
    setSupportSession(newSessionData);
    setStore(targetStore);
    setStoreId(targetStoreId);
    setHasValidStore(true);
    const blocked = checkSubscriptionStatus(targetStore);
    setIsSubscriptionBlocked(blocked);

    // Log audit trail
    const { logSuperAdminAction } = await import('../lib/superAdminAudit');
    await logSuperAdminAction({
      store_id: targetStoreId,
      action_type: 'switch_support_store',
      notes: `Trocou para loja: ${targetStore.name}`,
    });

    logger.log('✅ [switchSupportStore] Troca de loja concluída');
  };

  const signOut = async () => {
    const currentUser = user;
    logger.log('👋 [signOut] Iniciando logout...');

    try {
      // Encerrar suporte se ativo
      if (supportSession) {
        logger.log('🛠️ [signOut] Encerrando modo suporte...');
        await endSupportMode();
      }

      // Limpar support_mode_store_id se existir
      if (currentUser && (isSuperAdmin || isSystemAdmin)) {
        logger.log('🧹 [signOut] Limpando support_mode_store_id...');
        await supabase
          .from('profiles')
          .update({ support_mode_store_id: null })
          .eq('id', currentUser.id);
      }

      // Fazer logout no Supabase
      logger.log('🔐 [signOut] Chamando supabase.auth.signOut()...');
      await supabase.auth.signOut();

      // Limpar TODOS os estados de autenticação de forma síncrona e explícita
      logger.log('🧹 [signOut] Limpando todos os estados...');
      setSession(null);
      setUser(null);
      setProfile(null);
      setStore(null);
      setHasValidStore(false);
      setIsSubscriptionBlocked(false);
      setIsSystemAdmin(false);
      setIsSuperAdmin(false);
      setUserRole(null);
      setStoreId(null);
      setSupportSession(null);
      setIsSupportMode(false);
      setLoading(false);

      // Registrar auditoria
      if (currentUser) {
        await logAuditEvent({
          userId: currentUser.id,
          eventType: 'logout',
          eventStatus: 'success',
        });
      }

      logger.log('✅ [signOut] Logout concluído com sucesso');

      // Navegação explícita para /login para evitar tela branca
      logger.log('🔄 [signOut] Redirecionando para /login...');
      window.location.href = '/login';
    } catch (error) {
      logger.error('❌ [signOut] Erro durante logout:', error);

      // Garantir limpeza mesmo em caso de erro
      setSession(null);
      setUser(null);
      setProfile(null);
      setStore(null);
      setHasValidStore(false);
      setIsSubscriptionBlocked(false);
      setIsSystemAdmin(false);
      setIsSuperAdmin(false);
      setUserRole(null);
      setStoreId(null);
      setSupportSession(null);
      setIsSupportMode(false);
      setLoading(false);

      // Navegação mesmo em caso de erro
      window.location.href = '/login';
    }
  };

  const effectivePlan = getEffectivePlan(store, isSuperAdmin, isSupportMode);

  // CRITICAL: Effective user role for support mode
  // When super admin is in support mode, they operate as 'owner' in the target store
  // This allows them to access all store features without actually being a store user
  const effectiveUserRole: UserRole = (isSupportMode && supportSession && storeId)
    ? 'owner'
    : userRole;

  // Role helpers - use effectiveUserRole for all permission checks
  const isOwner = effectiveUserRole === 'owner';
  const isManager = effectiveUserRole === 'manager';
  const isStaff = effectiveUserRole === 'staff';

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      store,
      session,
      loading,
      hasValidStore,
      isSubscriptionBlocked,
      isSystemAdmin,
      isSuperAdmin,
      supportSession,
      isSupportMode,
      userRole,
      effectiveUserRole,
      storeId,
      effectivePlan,
      isOwner,
      isManager,
      isStaff,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      startSupportMode,
      endSupportMode,
      switchSupportStore
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
