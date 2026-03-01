import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Explanation {
  point: string;
  explanation: string;
}

export interface Message {
  id: number;
  type: 'partner' | 'self';
  original: string;
  translation: string;
  reverseTranslation: string;
  explanation: Explanation;
}

export interface Partner {
  id: number;
  name: string;
  language: string;
  flag: string;
  avatar: string;
  avatarImage?: string | null;
  lastMessage: string;
  lastTime: string;
  messages: Message[];
  tag?: string;
  isPinned?: boolean;
}

export interface Tag {
  id: string;
  name: string;
  isDefault: boolean;
}

const STORAGE_KEYS = {
  PARTNERS: 'nijilingo_partners',
  TAGS: 'nijilingo_tags',
} as const;

export interface TranslateChatMessage {
  id: number;
  type: 'self' | 'partner';
  original: string;
  translation: string;
  reverseTranslation: string;
  explanation: { point: string; explanation: string } | null;
  detectedLanguage?: string;
}

export type TranslationCacheEntry = {
  translation: string;
  reverseTranslation: string;
  noChange?: boolean;
};

export type TranslateDraft = {
  partnerInputText: string;
  selfInputText: string;
  // 翻訳結果
  preview: { translation: string; reverseTranslation: string; explanation: { point: string; explanation: string } | null; noChange?: boolean };
  showPreview: boolean;
  previewSourceText: string;
  // トーン調整
  toneAdjusted: boolean;
  sliderValue: number;
  sliderBucket: number;
  isCustomActive: boolean;
  customTone: string;
  lockedSliderPosition: number | null;
  toneDiffExplanation: { point: string; explanation: string } | null;
  // 検出言語
  detectedLang: string;
  // メッセージボード履歴
  messages: TranslateChatMessage[];
  // 翻訳キャッシュ（ナビゲーション跨ぎ永続化）
  translationCache: Record<string, TranslationCacheEntry>;
  // 解説キャッシュ
  explanationCache: Record<string, { point: string; explanation: string }>;
};

type AppDataContextValue = {
  partners: Partner[];
  tags: Tag[];
  selectedTag: string;
  currentPartnerId: number | null;
  isLoaded: boolean;
  translateDraft: TranslateDraft;
  setTranslateDraft: (patch: Partial<TranslateDraft> | ((prev: TranslateDraft) => Partial<TranslateDraft>)) => void;
  setSelectedTag: (id: string) => void;
  setCurrentPartnerId: (id: number | null) => void;
  addPartner: (partner: Omit<Partner, 'id' | 'lastMessage' | 'lastTime'> & { id?: number; lastMessage?: string; lastTime?: string }) => Partner;
  updatePartner: (id: number, patch: Partial<Partner>) => void;
  deletePartner: (id: number) => void;
  togglePin: (id: number) => void;
  changePartnerTag: (id: number, tagId?: string) => void;
  addMessagesToPartner: (id: number, messages: Message[]) => void;
  addTag: (name: string) => void;
  editTag: (id: string, name: string) => void;
  deleteTag: (id: string) => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const DEFAULT_TAGS: Tag[] = [
  { id: 'all', name: 'すべて', isDefault: true },
  { id: 'friends', name: '友達', isDefault: false },
  { id: 'business', name: 'ビジネス', isDefault: false },
];

const nowLabel = () => '今';

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [currentPartnerId, setCurrentPartnerId] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [translateDraft, setTranslateDraftRaw] = useState<TranslateDraft>({
    partnerInputText: '', selfInputText: '',
    preview: { translation: '', reverseTranslation: '', explanation: null },
    showPreview: false, previewSourceText: '',
    toneAdjusted: false, sliderValue: 0, sliderBucket: 0,
    isCustomActive: false, customTone: '', lockedSliderPosition: null, toneDiffExplanation: null,
    detectedLang: '', messages: [],
    translationCache: {}, explanationCache: {},
  });

  const setTranslateDraft = (patch: Partial<TranslateDraft> | ((prev: TranslateDraft) => Partial<TranslateDraft>)) => {
    setTranslateDraftRaw(prev => {
      const resolved = typeof patch === 'function' ? patch(prev) : patch;
      return { ...prev, ...resolved };
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [partnersRaw, tagsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.PARTNERS),
          AsyncStorage.getItem(STORAGE_KEYS.TAGS),
        ]);
        if (!mounted) return;
        if (partnersRaw) setPartners(JSON.parse(partnersRaw));
        if (tagsRaw) setTags(JSON.parse(tagsRaw));
      } catch {
        // ignore load errors
      } finally {
        if (mounted) setIsLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(partners)).catch(() => {});
  }, [partners, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(tags)).catch(() => {});
  }, [tags, isLoaded]);

  const addPartner = (partner: Omit<Partner, 'id' | 'lastMessage' | 'lastTime'> & { id?: number; lastMessage?: string; lastTime?: string }): Partner => {
    const newPartner: Partner = {
      id: partner.id ?? Date.now(),
      name: partner.name,
      language: partner.language,
      flag: partner.flag,
      avatar: partner.avatar,
      avatarImage: partner.avatarImage ?? null,
      lastMessage: partner.lastMessage ?? '',
      lastTime: partner.lastTime ?? '',
      messages: partner.messages ?? [],
      tag: partner.tag,
      isPinned: partner.isPinned ?? false,
    };
    setPartners(prev => [newPartner, ...prev]);
    return newPartner;
  };

  const updatePartner = (id: number, patch: Partial<Partner>) => {
    setPartners(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const deletePartner = (id: number) => {
    setPartners(prev => prev.filter(p => p.id !== id));
    if (currentPartnerId === id) setCurrentPartnerId(null);
  };

  const togglePin = (id: number) => {
    setPartners(prev => prev.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p));
  };

  const changePartnerTag = (id: number, tagId?: string) => {
    setPartners(prev => prev.map(p => p.id === id ? { ...p, tag: tagId || undefined } : p));
  };

  const addMessagesToPartner = (id: number, messages: Message[]) => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    setPartners(prev => prev.map(p => p.id === id ? {
      ...p,
      messages: [...p.messages, ...messages],
      lastMessage: last.translation,
      lastTime: nowLabel(),
    } : p));
  };

  const addTag = (name: string) => {
    if (!name.trim()) return;
    const newTag: Tag = { id: `tag_${Date.now()}`, name: name.trim(), isDefault: false };
    setTags(prev => [...prev, newTag]);
  };

  const editTag = (id: string, name: string) => {
    if (!name.trim()) return;
    setTags(prev => prev.map(t => t.id === id ? { ...t, name: name.trim() } : t));
  };

  const deleteTag = (id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
    // remove tag from partners
    setPartners(prev => prev.map(p => p.tag === id ? { ...p, tag: undefined } : p));
    if (selectedTag === id) setSelectedTag('all');
  };

  const value = useMemo<AppDataContextValue>(() => ({
    partners,
    tags,
    selectedTag,
    currentPartnerId,
    isLoaded,
    translateDraft,
    setTranslateDraft,
    setSelectedTag,
    setCurrentPartnerId,
    addPartner,
    updatePartner,
    deletePartner,
    togglePin,
    changePartnerTag,
    addMessagesToPartner,
    addTag,
    editTag,
    deleteTag,
  }), [partners, tags, selectedTag, currentPartnerId, isLoaded, translateDraft]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
