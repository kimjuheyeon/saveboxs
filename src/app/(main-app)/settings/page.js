'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, LogOut, Sparkles, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ActionSnackbar from '@/components/ActionSnackbar';
import GoogleMaterialButton from '@/components/GoogleMaterialButton';
import { getSupabaseBrowserClientSafe } from '@/lib/supabase/client';
import { deleteAllContents, clearUserIdCache } from '@/lib/api';

const AUTH_STATES = {
  anonymous: 'anonymous',
  social: 'social',
};

const OAUTH_CONFLICT_MESSAGE_PATTERN = /(already.*exists|identity.*exists|provider.*already|already.*linked|email.*associated|different.*provider|이미.*다른|다른.*제공자)/i;
const OAUTH_PROVIDER_DISABLED_PATTERN = /(provider.*not.*enabled|unsupported.*provider|provider.*disabled|지원.*되지|미활성화|비활성화)/i;

const PROVIDER_LABEL = {
  google: 'Google',
};

const PROVIDER_BADGE = {
  google: 'Google 연동',
};

const AVAILABLE_PROVIDERS = {
  google: {
    label: 'Google',
    badge: 'G',
    chipClass: 'bg-[#1a2540] text-[#6d9fd6]',
  },
};

const ACTIVATED_SOCIAL_PROVIDERS = (() => {
  const raw = process.env.NEXT_PUBLIC_SOCIAL_PROVIDERS || 'google';
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const normalized = parsed.filter((provider) => AVAILABLE_PROVIDERS[provider]);
  return normalized.length > 0 ? normalized : ['google'];
})();

const isProviderActive = (provider) => ACTIVATED_SOCIAL_PROVIDERS.includes(provider);

const buildAuthCallbackUrl = (mode, provider) => {
  if (typeof window === 'undefined') {
    const fallbackBase = process.env.NEXT_PUBLIC_SITE_URL || '';
    if (fallbackBase) return `${fallbackBase.replace(/\/$/, '')}/auth/callback?mode=${mode}&provider=${provider}`;
    return '/auth/callback?mode=' + mode + '&provider=' + provider;
  }

  const explicitBase = process.env.NEXT_PUBLIC_SITE_URL;
  const base = (explicitBase || window.location.origin).replace(/\/$/, '');
  return `${base}/auth/callback?mode=${mode}&provider=${provider}`;
};

const buildSocialConflictMessage = (provider) =>
  `이미 ${PROVIDER_LABEL[provider] || 'Google'}로 가입된 이메일이에요. 로그인 화면에서 로그인해주세요.`;

const normalizeAuthState = (sessionUser) => {
  const connected = new Set();
  const providers = [
    sessionUser?.app_metadata?.provider,
    ...(Array.isArray(sessionUser?.app_metadata?.providers) ? sessionUser.app_metadata.providers : []),
    ...(Array.isArray(sessionUser?.identities) ? sessionUser.identities : []).map((identity) => identity?.provider),
  ];

  providers.forEach((provider) => {
    if (provider === 'google') {
      connected.add(provider);
    }
  });

  if (connected.has('google')) {
    return { type: AUTH_STATES.social, provider: 'google', email: sessionUser?.email || '이메일 없음' };
  }

  return { type: AUTH_STATES.anonymous, email: '비로그인 상태' };
};

export default function SettingsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
  const [sessionUser, setSessionUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isBusy, setIsBusy] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const connectedSocialProviders = useMemo(() => {
    const providers = new Set();

    const list = [
      ...(sessionUser?.app_metadata?.providers || []),
      ...(sessionUser?.identities || []).map((identity) => identity?.provider).filter(Boolean),
      sessionUser?.app_metadata?.provider,
    ];

    list.forEach((provider) => {
      if (provider === 'google') {
        providers.add(provider);
      }
    });

    return Array.from(providers);
  }, [sessionUser]);

  const isProviderConnected = (provider) => connectedSocialProviders.includes(provider);

  const activeSocialProviders = ACTIVATED_SOCIAL_PROVIDERS;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingToast = window.sessionStorage.getItem('settings-toast');
    if (pendingToast) {
      setToastMessage(pendingToast);
      window.sessionStorage.removeItem('settings-toast');
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClientSafe();

    if (!supabase) {
      setAuthState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
      setSessionUser(null);
      setIsAuthLoading(false);
      return;
    }

    const hydrate = async () => {
      setIsAuthLoading(true);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session?.user) {
          setAuthState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
          setSessionUser(null);
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const resolvedUser = userData?.user || sessionData.session.user;
        setSessionUser(resolvedUser || null);
        setAuthState(normalizeAuthState(resolvedUser));
      } catch {
        setAuthState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
        setSessionUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };

    void hydrate();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void hydrate();
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (message) => {
    if (!message) return;
    setToastMessage(message);
  };

  const renderGoogleButton = ({ onClick, disabled, loading, label }) => (
    <GoogleMaterialButton
      onClick={onClick}
      disabled={disabled}
      isLoading={loading}
      label={label}
          />
  );

  const handleSocialSignIn = async (provider) => {
    if (!isProviderActive(provider)) {
      showToast('현재 지원되지 않는 소셜 로그인입니다.');
      return;
    }

    const supabase = getSupabaseBrowserClientSafe();
    if (!supabase) {
      showToast('소셜 로그인을 시작할 수 없습니다.');
      return;
    }

    setIsBusy(`signin-${provider}`);
    try {
      const redirectTo = buildAuthCallbackUrl('signin', provider);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        const conflict = OAUTH_CONFLICT_MESSAGE_PATTERN.test(error.message || '');
        const disabled = OAUTH_PROVIDER_DISABLED_PATTERN.test(error.message || '');
        if (conflict) {
          showToast(buildSocialConflictMessage(provider));
          router.push('/settings');
          return;
        }
        if (disabled) {
          showToast('해당 소셜 로그인이 현재 비활성화되어 있습니다.');
          return;
        }
        showToast('로그인에 실패했어요. Google로 다시 시도해주세요.');
        router.push('/auth');
      }
    } catch {
      showToast('로그인에 실패했어요. Google로 다시 시도해주세요.');
      router.push('/auth');
    } finally {
      setIsBusy('');
    }
  };

  const handleSocialLink = async (provider) => {
    if (isProviderConnected(provider)) return;

    const supabase = getSupabaseBrowserClientSafe();
    if (!supabase) {
      showToast('소셜 연동을 시작할 수 없습니다.');
      return;
    }

    setIsBusy(`link-${provider}`);
    try {
      const redirectTo = buildAuthCallbackUrl('link', provider);
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo },
      });

      if (error || !data?.url) {
        showToast('연동에 실패했어요. 잠시 후 다시 시도해주세요.');
        return;
      }

      window.location.assign(data.url);
    } catch {
      showToast('연동에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsBusy('');
    }
  };

  const handleLogout = async () => {
    if (isBusy) return;

    if (!confirm('로그아웃 하시겠어요?')) return;
    setIsBusy('logout');

    try {
      const supabase = getSupabaseBrowserClientSafe();
      if (supabase) {
        await supabase.auth.signOut();
      }

      clearUserIdCache();
      setSessionUser(null);
      setAuthState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
      showToast('로그아웃되었습니다.');
      router.push('/settings');
    } catch {
      showToast('로그아웃에 실패했어요.');
    } finally {
      setIsBusy('');
    }
  };

  const handleDeleteAccount = async () => {
    if (isBusy) return;

    if (!confirm('계정을 삭제하면 저장한 데이터는 복구할 수 없어요. 삭제할까요?')) return;

    setIsBusy('delete');
    try {
      const response = await fetch('/api/auth/delete-account', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(payload?.error || '계정 삭제에 실패했어요.');
        return;
      }

      const supabase = getSupabaseBrowserClientSafe();
      if (supabase) {
        await supabase.auth.signOut();
      }

      clearUserIdCache();
      setSessionUser(null);
      setAuthState({ type: AUTH_STATES.anonymous, email: '비로그인 상태' });
      showToast('계정이 삭제되었어요.');
      router.push('/auth');
    } catch {
      showToast('계정 삭제에 실패했어요.');
    } finally {
      setIsBusy('');
    }
  };

  const [deleteAllStep, setDeleteAllStep] = useState(0);

  const handleDeleteAllContents = async () => {
    setIsBusy('delete-all');
    try {
      await deleteAllContents();
      showToast('모든 콘텐츠가 삭제되었습니다.');
    } catch {
      showToast('콘텐츠 삭제에 실패했어요.');
    } finally {
      setIsBusy('');
      setDeleteAllStep(0);
    }
  };

  const accountRowsByState = () => {
    if (authState.type === AUTH_STATES.anonymous) {
      const socialSignupRows = activeSocialProviders.map((provider) => {
        const isSigningIn = isBusy === `signin-${provider}`;
        const loadingLabel = isSigningIn ? '처리 중...' : 'Sign in with Google';

        return (
          <div key={`signup-social-${provider}`}>
            {renderGoogleButton({
              onClick: () => handleSocialSignIn(provider),
              disabled: Boolean(isBusy),
              loading: isSigningIn,
              label: loadingLabel,
            })}
          </div>
        );
      });

      return (
        <>
          {socialSignupRows}
        </>
      );
    }

    if (authState.type === AUTH_STATES.social) {
      return (
        <>
          <div className="rounded-[8px] px-3 py-3">
            <p className="text-sm font-semibold text-slate-100">계정 정보</p>
            <p className="mt-1 text-xs text-[#616161]">{authState.email}</p>
          </div>
          <Link
            href="/collections"
            className="flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="text-sm font-semibold text-slate-100">저장 설정</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#616161]">
              기본 컬렉션
              <ChevronRight size={16} />
            </span>
          </Link>
        </>
      );
    }

    return null;
  };

  const socialRows = useMemo(
    () =>
      activeSocialProviders.map((provider) => {
        const label = PROVIDER_LABEL[provider] || provider;
        const connected = connectedSocialProviders.includes(provider);
        const isCurrent = authState.type === AUTH_STATES.social && authState.provider === provider;

        return (
          <div key={provider} className="flex items-center justify-between rounded-[8px] px-3 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {provider === 'google' && (
                <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">{label}</p>
              <p className="mt-1 text-xs text-[#616161]">
                {connected ? `${label} 연동됨${isCurrent ? ' (현재 계정)' : ''}` : '연동되지 않음'}
              </p>
              </div>
            </div>
            {connected ? (
              <span className="rounded-[8px] bg-[#1E1E1E] px-2 py-1 text-xs font-semibold text-[#616161]">연결됨</span>
            ) : (
              <button
                type="button"
                onClick={() => handleSocialLink(provider)}
                disabled={Boolean(isBusy)}
                className="rounded-[8px] border border-[#323232] px-2 py-1 text-xs font-semibold text-[#6d9fd6] transition hover:bg-[#1a2540] active:bg-[#243050] disabled:opacity-50 disabled:pointer-events-none"
              >
                연동하기
              </button>
            )}
          </div>
        );
      }),
    [authState, isBusy, connectedSocialProviders, activeSocialProviders, handleSocialLink]
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-[440px] bg-[#101010] pb-10">
      <PageHeader title="설정" />

      {isAuthLoading ? (
        <section className="px-4 py-4 text-sm text-[#616161]">사용자 상태를 불러오는 중...</section>
      ) : (
        <>
          <section className="px-4 pt-4">
            <div className="rounded-[14px] border border-[#323232] bg-[#1E1E1E] p-4 shadow-sm">
              {authState.type === AUTH_STATES.anonymous ? (
                <>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-[8px] bg-[#1a2540] px-2 py-1 text-xs font-semibold text-[#6d9fd6]">
                    <Sparkles size={14} />
                    비로그인
                  </div>
                  <p className="text-sm font-bold text-slate-100">Google 로그인 후 저장/동기화 기능을 사용할 수 있어요.</p>
                </>
              ) : (
                authState.type === AUTH_STATES.social ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-[8px] bg-[#353535] px-2 py-1 text-[11px] font-semibold text-white">
                        {PROVIDER_BADGE[authState.provider]}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-100">{authState.email}</p>
                    <p className="mt-1 text-xs text-[#616161]">연동된 제공자로 로그인됨</p>
                  </>
                ) : null
              )}
            </div>
          </section>

          <section className="mb-4 px-4 pt-4">
            <h2 className="mb-2 px-2 text-xs font-semibold text-[#616161]">계정</h2>
            {authState.type === AUTH_STATES.anonymous ? (
              <div className="px-1">
                {accountRowsByState()}
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15 px-4 py-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px]">✓</span>
                  <p className="text-[13px] font-medium text-emerald-400">저장한 콘텐츠는 로그인 시 자동으로 옮겨져요</p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] border border-[#323232] bg-[#1E1E1E]">
                <div className="space-y-1 p-1">{accountRowsByState()}</div>
              </div>
            )}
          </section>

          {authState.type === AUTH_STATES.social ? (
            <section className="mb-4 px-4">
              <h2 className="mb-2 px-2 text-xs font-semibold text-[#616161]">소셜 연동 관리</h2>
              <div className="overflow-hidden rounded-[14px] border border-[#323232] bg-[#1E1E1E]">
                <div className="space-y-1 p-1">{socialRows}</div>
              </div>
            </section>
          ) : null}

          <section className="mb-4 px-4">
            <h2 className="mb-2 px-2 text-xs font-semibold text-[#616161]">앱 정보</h2>
            <div className="overflow-hidden rounded-[14px] border border-[#323232] bg-[#1E1E1E]">
              <div className="flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left">
                <span className="text-sm font-semibold text-slate-100">버전</span>
                <span className="text-xs font-semibold text-[#616161]">SaveBox v1.0.3</span>
              </div>
            </div>
          </section>

          {authState.type === AUTH_STATES.social ? (
            <section className="px-4">
              <h2 className="mb-2 px-2 text-xs font-semibold text-[#616161]">데이터 관리</h2>
              <div className="overflow-hidden rounded-[14px] border border-[#323232] bg-[#1E1E1E]">
                <button
                  type="button"
                  onClick={() => setDeleteAllStep(1)}
                  disabled={Boolean(isBusy)}
                  className="flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-400">
                    <Trash2 size={16} />
                    모든 콘텐츠 삭제
                  </span>
                  <ChevronRight size={16} className="text-[#616161]" />
                </button>
              </div>
            </section>
          ) : null}

          {authState.type === AUTH_STATES.social ? (
            <section className="mt-4 px-4">
              <h2 className="mb-2 px-2 text-xs font-semibold text-[#616161]">안전</h2>
              <div className="overflow-hidden rounded-[14px] border border-[#323232] bg-[#1E1E1E]">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={Boolean(isBusy)}
                  className="flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                    <LogOut size={16} />
                    로그아웃
                  </span>
                  <ChevronRight size={16} className="text-[#616161]" />
                </button>

                {authState.type === AUTH_STATES.social ? (
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={Boolean(isBusy)}
                    className="flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-400">
                      <Trash2 size={16} />
                      계정 삭제
                    </span>
                    <ChevronRight size={16} className="text-[#616161]" />
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}

      {deleteAllStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setDeleteAllStep(0)}>
          <div className="w-full max-w-[340px] rounded-2xl bg-[#1E1E1E] border border-[#323232] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {deleteAllStep === 1 ? (
              <>
                <div className="mb-1 flex items-center gap-2 text-rose-400">
                  <Trash2 size={20} />
                  <h3 className="text-base font-bold">모든 콘텐츠 삭제</h3>
                </div>
                <p className="mt-2 text-sm text-[#777777]">
                  저장된 모든 콘텐츠가 영구적으로 삭제됩니다.<br />이 작업은 되돌릴 수 없어요.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteAllStep(0)}
                    className="flex-1 rounded-xl border border-[#323232] py-2.5 text-sm font-semibold text-[#777777] transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteAllStep(2)}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 active:bg-rose-400"
                  >
                    삭제할게요
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2 text-rose-400">
                  <AlertTriangle size={20} />
                  <h3 className="text-base font-bold">정말 삭제하시겠어요?</h3>
                </div>
                <p className="mt-2 text-sm text-[#777777]">
                  삭제하면 복구할 수 없습니다.<br />정말로 모든 콘텐츠를 삭제할까요?
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteAllStep(0)}
                    className="flex-1 rounded-xl border border-[#323232] py-2.5 text-sm font-semibold text-[#777777] transition hover:bg-[#1f2a42] active:bg-[#2a3652] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    아니요
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAllContents}
                    disabled={isBusy === 'delete-all'}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isBusy === 'delete-all' ? '삭제 중...' : '네, 모두 삭제'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ActionSnackbar
        open={Boolean(toastMessage)}
        message={toastMessage}
      />
    </main>
  );
}
