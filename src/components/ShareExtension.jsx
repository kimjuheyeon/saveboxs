'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Plus, RotateCcw, Loader2 } from 'lucide-react';
import { ICON_BUTTON_BASE_CLASS, ICON_BUTTON_ICON_SIZE, ICON_BUTTON_SIZE_CLASS } from '@/lib/iconUI';
import ActionSnackbar from '@/components/ActionSnackbar';
import ClearableInput from '@/components/ClearableInput';
import { fetchCollections, createContent, createCollection } from '@/lib/api';
import { getSourceMeta } from '@/lib/prototypeData';

const DEMO_CONTENT = {
  title: '비트코인 소름 돋는 예언 하나 할게',
  thumbnail: '/thumbnail/dd1994d5301ea079533443fdf481775d.jpg',
  source: 'Threads',
};

const DEMO_COLLECTIONS = [
  { id: 'c1', name: 'UI 레퍼런스', thumbnail: '/thumbnail/2aca272e2362eaf5a34383381000c9a7.jpg' },
  { id: 'c2', name: '개발 아티클', thumbnail: '/thumbnail/6912ebf347095999d3b8597ec1c0c887.jpg' },
  { id: 'c3', name: '맛집 리스트', thumbnail: '/thumbnail/b1d0c3bfdcd04d80dd8fde350cdf2946.jpg' },
  { id: 'c4', name: '나중에 볼 영상', thumbnail: '/thumbnail/d7316f9967030db54150c3bf12937544.jpg' },
];

export default function ShareExtension({ sharedUrl = '', sharedTitle = '' }) {
  const isLiveMode = Boolean(sharedUrl);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('list');
  const [collections, setCollections] = useState(isLiveMode ? [] : DEMO_COLLECTIONS);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [savedCollection, setSavedCollection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // 실제 공유 데이터에서 파싱한 콘텐츠 정보
  const [content, setContent] = useState(
    isLiveMode
      ? { title: sharedTitle || sharedUrl, thumbnail: null, source: 'Other', url: sharedUrl }
      : { ...DEMO_CONTENT, url: '' }
  );

  const inputRef = useRef(null);

  // 실제 모드: 컬렉션 로드 + og:meta 파싱
  useEffect(() => {
    if (!isLiveMode) return;

    async function init() {
      // 컬렉션 목록 로드
      try {
        const cols = await fetchCollections();
        setCollections(cols.filter((c) => !c.is_system));
      } catch {
        setCollections([]);
      }

      // URL에서 메타데이터 파싱
      if (sharedUrl) {
        setLoadingMeta(true);
        try {
          const res = await fetch('/api/og-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: sharedUrl }),
          });
          if (res.ok) {
            const meta = await res.json();
            setContent({
              title: meta.title || sharedTitle || sharedUrl,
              thumbnail: meta.thumbnailUrl || null,
              source: meta.source || 'Other',
              url: meta.url || sharedUrl,
            });
          }
        } catch {
          // 파싱 실패해도 URL은 유지
        } finally {
          setLoadingMeta(false);
        }
      }
    }

    init();
  }, [isLiveMode, sharedUrl, sharedTitle]);

  // 시트 열기 (0.8초 후)
  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (step === 'create' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  // 저장 성공 후 2초 자동 닫기
  useEffect(() => {
    let interval;
    if (step === 'success') {
      const startTime = Date.now();
      interval = setInterval(() => {
        if (Date.now() - startTime >= 2000) {
          handleClose();
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      setStep('list');
      setSavedCollection(null);
    }, 500);
  };

  const handleSaveToCollection = async (collection) => {
    if (isLiveMode) {
      setSaving(true);
      try {
        await createContent({
          title: content.title,
          url: content.url,
          thumbnailUrl: content.thumbnail,
          source: content.source,
          collectionId: collection.id,
        });
      } catch {
        // 게스트 저장도 지원 (api.js에서 처리)
      } finally {
        setSaving(false);
      }
    }

    setSavedCollection(collection);
    setIsOpen(false);
    setStep('success');
  };

  const handleCreateAndSave = async () => {
    if (!newCollectionName.trim()) return;

    if (isLiveMode) {
      setSaving(true);
      try {
        const newCol = await createCollection({
          name: newCollectionName.trim(),
        });
        await createContent({
          title: content.title,
          url: content.url,
          thumbnailUrl: content.thumbnail,
          source: content.source,
          collectionId: newCol.id,
        });
        setSavedCollection(newCol);
      } catch {
        setSavedCollection({ name: newCollectionName.trim() });
      } finally {
        setSaving(false);
      }
    } else {
      const newCollection = {
        id: `c-${Date.now()}`,
        name: newCollectionName,
      };
      setCollections([newCollection, ...collections]);
      setSavedCollection(newCollection);
    }

    setNewCollectionName('');
    setIsOpen(false);
    setStep('success');
  };

  const handleReset = () => {
    setIsOpen(false);
    setStep('list');
    if (!isLiveMode) setCollections(DEMO_COLLECTIONS);
    setNewCollectionName('');
    setSavedCollection(null);
    setTimeout(() => setIsOpen(true), 800);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCreateAndSave();
  };

  const sourceMeta = getSourceMeta(content.source);

  return (
    <div className="min-h-[100dvh] bg-[#101010] flex justify-center font-sans">
    <div className="relative w-full max-w-[440px] h-[100dvh] overflow-hidden">
      {/* Background */}
      {isLiveMode ? (
        <div className="absolute inset-0 bg-[#101010]" />
      ) : (
        <img
          src="/Image/default-screen.png"
          alt="threads background"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      )}

      {/* Black Overlay */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          isOpen || step === 'success' ? 'opacity-50' : 'opacity-0'
        }`}
      />

      {/* Reset Button (데모 모드 전용) */}
      {!isLiveMode && (
        <button
          onClick={handleReset}
          className="absolute top-[max(2rem,env(safe-area-inset-top,2rem))] right-4 z-[60] flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#1E1E1E]/80 backdrop-blur-sm text-slate-100 text-xs font-medium border border-[#323232] hover:bg-[#282828]/90 transition-colors min-h-[44px]"
        >
          <RotateCcw size={14} />
          리셋
        </button>
      )}

      {/* Share Extension Sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div
          className="rounded-t-2xl border border-[#323232] bg-[#1E1E1E] shadow-2xl w-full overflow-hidden"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Header Indicator */}
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 rounded-full bg-[#323232]"></div>
          </div>

          {/* Header - list step only */}
          {step === 'list' && (
            <>
              <div className="px-5 pt-2 pb-3 border-b border-[#323232]">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClose}
                      className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} -ml-1.5 text-[#777777] hover:text-slate-100`}
                    >
                      <X size={ICON_BUTTON_ICON_SIZE} />
                    </button>
                    <h2 className="text-lg font-bold text-slate-100">컬렉션에 저장</h2>
                  </div>
                  <button
                    onClick={() => setStep('create')}
                    className="text-sm font-semibold text-[#3385FF] hover:text-[#2f78f0] transition-colors min-h-[44px] flex items-center px-2"
                  >
                    + 새 컬렉션
                  </button>
                </div>
              </div>

              {/* S1-02: Content Preview Card */}
              <div className="px-5 py-3">
                <div className="flex items-center gap-3 px-3 py-3 rounded-[8px] bg-[#353535]">
                  {content.thumbnail ? (
                    <div className="w-12 h-12 rounded-[8px] overflow-hidden shrink-0">
                      <img src={content.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-[8px] shrink-0 bg-[#1E1E1E] flex items-center justify-center">
                      {sourceMeta.iconSrc ? (
                        <img src={sourceMeta.iconSrc} alt={content.source} className="h-6 w-6 object-contain opacity-60" />
                      ) : (
                        <span className="text-lg font-bold text-[#616161]">
                          {(content.title || 'S').charAt(0)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {loadingMeta ? (
                      <div className="flex items-center gap-2 text-sm text-[#616161]">
                        <Loader2 size={14} className="animate-spin" />
                        메타데이터 가져오는 중...
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-100 truncate">{content.title}</p>
                        <p className="text-xs text-[#777777] mt-0.5">{content.source}에서 공유됨</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Create step header */}
          {step === 'create' && (
            <div className="px-5 pt-2 pb-3 border-b border-[#323232]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('list')}
                  className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} -ml-1.5 text-[#777777] hover:text-slate-100`}
                >
                  <X size={ICON_BUTTON_ICON_SIZE} />
                </button>
                <h2 className="text-lg font-bold text-slate-100">새 컬렉션 만들기</h2>
              </div>
            </div>
          )}

          {/* Main Body Area */}
          <div className="px-5 py-4" style={{ minHeight: 'min(280px, 40dvh)' }}>
            {/* S1-03 Collection List */}
            {step === 'list' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <div className="space-y-1">
                  <div className="overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: 'min(280px, 35dvh)' }}>
                    {/* 미분류 저장 옵션 (실제 모드) */}
                    {isLiveMode && (
                      <button
                        onClick={() => handleSaveToCollection({ id: null, name: '미분류' })}
                        disabled={saving}
                        className="w-full flex items-center gap-3 p-3 rounded-[8px] hover:bg-[#282828] active:bg-[#333333] transition-colors text-left min-h-[56px]"
                      >
                        <div className="w-10 h-10 rounded-[8px] shrink-0 bg-[#353535] flex items-center justify-center text-sm font-bold text-[#616161]">
                          *
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100">미분류</p>
                          <p className="text-xs text-[#777777]">컬렉션 없이 바로 저장</p>
                        </div>
                        <div className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} rounded-[8px] text-[#777777]`}>
                          <Plus size={ICON_BUTTON_ICON_SIZE} />
                        </div>
                      </button>
                    )}

                    {collections.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => handleSaveToCollection(col)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 p-3 rounded-[8px] hover:bg-[#282828] active:bg-[#333333] transition-colors text-left min-h-[56px]"
                      >
                        <div className="w-10 h-10 rounded-[8px] overflow-hidden shrink-0 bg-[#353535]">
                          {col.thumbnail ? (
                            <img src={col.thumbnail} alt={col.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#616161]">
                              {col.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{col.name}</p>
                          <p className="text-xs text-[#777777]">{col.item_count ?? 0}개 항목</p>
                        </div>
                        <div
                          className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} rounded-[8px] text-[#777777] hover:bg-[#282828] hover:text-[#3385FF] transition-colors`}
                        >
                          <Plus size={ICON_BUTTON_ICON_SIZE} />
                        </div>
                      </button>
                    ))}

                    {isLiveMode && collections.length === 0 && (
                      <p className="py-6 text-center text-sm text-[#777777]">컬렉션이 없어요. 미분류로 저장하거나 새 컬렉션을 만드세요.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* S1-04 New Collection Input */}
            {step === 'create' && (
              <div className="animate-in fade-in slide-in-from-right-8">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#777777]">컬렉션명 (최대 30자)</span>
                    <ClearableInput
                      ref={inputRef}
                      type="text"
                      placeholder="예: UI 영감"
                      maxLength={30}
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </label>
                </div>

                <button
                  onClick={handleCreateAndSave}
                  disabled={!newCollectionName.trim() || saving}
                  className={`mt-4 w-full py-3.5 rounded-[8px] font-bold text-white transition-all transform active:scale-95 min-h-[48px] ${
                    newCollectionName.trim() && !saving
                      ? 'bg-[#3385FF] shadow-lg hover:bg-[#2f78f0] active:bg-[#2669d9]'
                      : 'bg-[#353535] text-[#616161] cursor-not-allowed'
                  }`}
                >
                  {saving ? '저장 중...' : '완료'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saving overlay */}
      {saving && (
        <div className="absolute inset-0 z-[55] flex items-center justify-center">
          <div className="rounded-2xl bg-[#1E1E1E]/95 backdrop-blur px-6 py-4 flex items-center gap-3 border border-[#323232]">
            <Loader2 size={20} className="animate-spin text-[#3385FF]" />
            <span className="text-sm font-semibold text-slate-100">저장 중...</span>
          </div>
        </div>
      )}

      <ActionSnackbar
        open={step === 'success'}
        message={`"${savedCollection?.name}"에 저장됨`}
        actionHref="/content"
        actionLabel="앱 열기"
        className="fixed inset-x-0 z-[70] px-4"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      />
    </div>
    </div>
  );
}
