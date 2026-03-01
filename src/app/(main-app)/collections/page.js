'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ListItem from '@/components/ListItem';
import { ICON_BUTTON_BASE_CLASS, ICON_BUTTON_ICON_SIZE, ICON_BUTTON_SIZE_CLASS } from '@/lib/iconUI';

import { Button } from '@/components/ui/button';
import { fetchCollections, createCollection, deleteCollections, deleteContentsInCollections, migrateGuestData } from '@/lib/api';



export default function CollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [newName, setNewName] = useState('');

  const [creating, setCreating] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [removableIds, setRemovableIds] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        await migrateGuestData();
        const data = await fetchCollections();
        setCollections(data);
      } catch (err) {
        console.error('Collections load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const userCollections = useMemo(() => collections.filter((c) => !c.is_system), [collections]);

  const listItems = useMemo(
    () =>
      collections.map((collection) => {
        const isSystem = collection.is_system;
        const count = collection.item_count || 0;
        return {
          id: collection.id,
          leading: (
            <div className="flex items-center gap-2">
              {editing && !isSystem ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIds((prev) =>
                      prev.includes(collection.id)
                        ? prev.filter((value) => value !== collection.id)
                        : [...prev, collection.id],
                    );
                  }}
                  className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} shrink-0 rounded-[4px] border ${
                    selectedIds.includes(collection.id)
                      ? 'bg-[#3385FF] border-[#3385FF] text-white'
                      : 'border-[#323232] bg-[#1E1E1E]'
                  }`}
                  aria-label={`${collection.name} 선택`}
                >
                  {selectedIds.includes(collection.id) && <Check size={ICON_BUTTON_ICON_SIZE} />}
                </button>
              ) : null}
              <span
                className={`grid h-12 w-12 place-items-center rounded-[8px] bg-[#353535] text-2xl ${isSystem ? 'grayscale' : ''}`}
                aria-hidden
              >
                📁
              </span>
            </div>
          ),
          title: (
            <span className="flex items-center gap-2">
              {collection.name}
              {isSystem && (
                <span className="rounded-[8px] border border-[#323232] px-2 py-0.5 text-[10px] text-[#777777]">
                  시스템
                </span>
              )}
            </span>
          ),
          subtitle: collection.description,
          trailing: (
            <p className="text-xs font-semibold text-[#777777]">{count}개</p>
          ),
          href: !editing ? `/content?collection=${collection.id}` : undefined,
        };
      }),
    [collections, editing, selectedIds],
  );

  const toggleEditing = () => {
    setEditing((prev) => !prev);
    setSelectedIds([]);
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || isDuplicate(trimmed)) return;

    try {
      const newCol = await createCollection({ name: trimmed });
      setCollections((prev) => [newCol, ...prev]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      alert('컬렉션 생성에 실패했습니다.');
    }
  };

  const isDuplicate = (name) =>
    collections.some((col) => col.name.toLowerCase() === name.toLowerCase());

  const handleDelete = () => {
    const removable = selectedIds.filter((id) => !collections.find((c) => c.id === id)?.is_system);
    if (removable.length === 0) {
      alert('시스템 컬렉션은 삭제할 수 없습니다.');
      return;
    }
    setRemovableIds(removable);
    setDeleteModal(true);
  };

  const executeDelete = async (withContents) => {
    setDeleteModal(false);
    try {
      if (withContents) {
        await deleteContentsInCollections(removableIds);
      }
      await deleteCollections(removableIds);
      setCollections((prev) => prev.filter((c) => !removableIds.includes(c.id)));
      setSelectedIds([]);
      setEditing(false);
    } catch (err) {
      alert('삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[440px] px-4 py-6">
        <div className="animate-pulse rounded-2xl bg-[#1E1E1E] p-8 text-center text-sm text-[#616161]">
          불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-[440px]">
      <PageHeader
        title="컬렉션"
        backHref="/"
        rightContent={
          <>
            <button
              onClick={toggleEditing}
              className="rounded-[8px] border border-[#323232] px-3 py-1.5 text-xs font-semibold text-[#777777] transition hover:bg-[#212b42] active:bg-[#283350]"
            >
              {editing ? '완료' : '편집'}
            </button>
            <button className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_SIZE_CLASS} rounded-[8px] border border-[#323232] text-[#777777] transition hover:bg-[#212b42] active:bg-[#283350]`}>
              <Search size={ICON_BUTTON_ICON_SIZE} />
            </button>
          </>
        }
      />

      <section className="space-y-2 px-4 pt-4">
        {listItems.map((item) => (
          <ListItem
            key={item.id}
            href={item.href}
            leading={item.leading}
            title={item.title}
            subtitle={item.subtitle}
            trailing={item.trailing}
          />
        ))}
      </section>

      {userCollections.length === 0 && !editing && !creating && (
        <section className="mx-4 mt-4 rounded-[8px] border border-dashed border-[#323232] bg-[#1E1E1E] p-8 text-center">
          <FolderPlus size={32} className="mx-auto mb-3 text-[#616161]" />
          <p className="text-sm font-semibold text-[#777777]">아직 컬렉션이 없어요</p>
          <p className="mt-1 text-xs text-[#777777]">첫 컬렉션을 만들어 콘텐츠를 정리해 보세요.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-[#3385FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2f78f0] active:bg-[#2669d9]"
          >
            <Plus size={14} />
            첫 컬렉션 만들기
          </button>
        </section>
      )}

      {editing && (
        <div className="mx-4 mt-4 flex items-center justify-between">
          <p className="text-xs text-[#777777]">체크한 컬렉션 {selectedIds.length}개</p>
          <button
            onClick={handleDelete}
            disabled={selectedIds.length === 0}
            className="rounded-[8px] bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 active:bg-rose-400 disabled:bg-rose-900 disabled:pointer-events-none"
          >
            <span className="inline-flex items-center gap-1">
              <Trash2 size={12} />
              삭제
            </span>
          </button>
        </div>
      )}

      {!editing && (
        <div
          className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2"
          style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 32px)' }}
        >
          <div className="flex justify-end px-4">
            <button
              onClick={() => setCreating((prev) => !prev)}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#3385FF] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#2f78f0] active:bg-[#2669d9]"
            >
              <Pencil size={16} /> 새 컬렉션 만들기
            </button>
          </div>
        </div>
      )}

      {creating && (
        <>
          <div onClick={() => { setCreating(false); setNewName(''); setNewColor('Blue'); }} className="fixed inset-0 z-30 bg-black/60" />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[440px]">
            <div
              className="rounded-t-2xl border border-[#323232] bg-[#1E1E1E] p-4 shadow-2xl"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => { setCreating(false); setNewName(''); setNewColor('Blue'); }}
                  className="rounded-[8px] p-2 text-[#777777] transition hover:bg-[#1f2a42] active:bg-[#2a3652]"
                >
                  <X size={20} />
                </button>
                <h2 className="text-sm font-bold text-slate-100">새 컬렉션 생성</h2>
                <div className="w-9" />
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#777777]">컬렉션명 (최대 30자)</span>
                  <input
                    value={newName}
                    maxLength={30}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="예: UI 영감"
                    autoFocus
                    className="w-full rounded-[8px] border border-[#323232] bg-[#1E1E1E] px-3 py-2.5 text-sm text-slate-100 placeholder:text-[#616161] outline-none focus:border-indigo-500"
                  />
                  {newName.trim() && isDuplicate(newName.trim()) && (
                    <p className="mt-1 text-xs text-rose-400">이미 같은 이름의 컬렉션이 있습니다.</p>
                  )}
                </label>

              </div>

              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || isDuplicate(newName.trim())}
                className="mt-4 w-full bg-[#3385FF] py-3 text-sm font-bold text-white hover:bg-[#2f78f0] active:bg-[#2669d9] disabled:bg-indigo-900 disabled:text-indigo-600"
              >
                생성
              </Button>
            </div>
          </div>
        </>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setDeleteModal(false)}>
          <div className="w-full max-w-[340px] rounded-2xl border border-[#323232] bg-[#1E1E1E] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-100">삭제 방식을 선택해주세요</h3>
            <p className="mt-2 text-sm text-[#777777]">
              컬렉션 <span className="font-semibold text-slate-100">{removableIds.length}개</span>를 어떻게 삭제할까요?
            </p>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => executeDelete(false)}
                className="w-full rounded-xl border border-[#323232] px-4 py-3 text-left transition hover:bg-[#282828] active:bg-[#333333]"
              >
                <p className="text-sm font-semibold text-slate-100">컬렉션만 삭제</p>
                <p className="mt-0.5 text-xs text-[#777777]">콘텐츠는 미분류로 이동해요</p>
              </button>
              <button
                onClick={() => executeDelete(true)}
                className="w-full rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-left transition hover:bg-rose-950/50 active:bg-rose-950/70"
              >
                <p className="text-sm font-semibold text-rose-400">콘텐츠도 함께 삭제</p>
                <p className="mt-0.5 text-xs text-[#777777]">포함된 콘텐츠가 모두 삭제돼요</p>
              </button>
            </div>
            <button
              onClick={() => setDeleteModal(false)}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-[#777777] transition hover:bg-[#282828]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
