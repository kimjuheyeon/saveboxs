'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClientSafe } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClientSafe();
    if (!supabase) {
      router.replace('/auth?error=Supabase 환경변수가 설정되지 않았습니다.');
      return;
    }

    // onAuthStateChange로 세션 확립을 기다림 (implicit flow hash 파싱 포함)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        subscription.unsubscribe();
        router.replace('/content');
      }
    });

    // 이미 세션이 있는 경우 바로 이동
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace('/content');
      }
    });

    // 10초 타임아웃 (기존 5초 → 여유있게)
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      // 마지막으로 한번 더 세션 확인
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/content');
        } else {
          router.replace('/auth?error=인증에 실패했어요. 다시 시도해 주세요.');
        }
      });
    }, 10000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212]">
      <p className="text-sm text-slate-400">로그인 처리 중...</p>
    </main>
  );
}
