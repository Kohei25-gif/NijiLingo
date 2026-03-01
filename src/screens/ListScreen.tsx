import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pin, Tag, Trash2, Home } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppData } from '../context/AppDataContext';
import { LANGUAGE_OPTIONS } from '../constants/languages';

type RootStackParamList = {
  List: undefined;
  Chat: { partnerId: number };
  Home: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'List'>;

export default function ListScreen({ navigation }: Props) {
  const {
    partners,
    tags,
    selectedTag,
    setSelectedTag,
    setCurrentPartnerId,
    addPartner,
    deletePartner,
    togglePin,
    changePartnerTag,
    addTag,
    editTag,
    deleteTag,
  } = useAppData();

  const [searchText, setSearchText] = useState('');
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerLanguage, setNewPartnerLanguage] = useState('英語');
  const [showPartnerMenu, setShowPartnerMenu] = useState(false);
  const [menuPartnerId, setMenuPartnerId] = useState<number | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');

  const filteredPartners = useMemo(() => {
    const byTag = selectedTag === 'all'
      ? partners
      : partners.filter(p => p.tag === selectedTag);
    const bySearch = searchText.trim()
      ? byTag.filter(p => p.name.includes(searchText.trim()))
      : byTag;
    const pinned = bySearch.filter(p => p.isPinned);
    const rest = bySearch.filter(p => !p.isPinned);
    return [...pinned, ...rest];
  }, [partners, selectedTag, searchText]);

  const openPartnerMenu = (partnerId: number) => {
    setMenuPartnerId(partnerId);
    setShowPartnerMenu(true);
  };

  const closePartnerMenu = () => {
    setShowPartnerMenu(false);
    setShowTagPicker(false);
    setShowDeleteConfirm(false);
  };

  const handleCreatePartner = () => {
    if (!newPartnerName.trim()) return;
    const lang = LANGUAGE_OPTIONS.find(l => l.name === newPartnerLanguage) || LANGUAGE_OPTIONS[0];
    const created = addPartner({
      name: newPartnerName.trim(),
      language: newPartnerLanguage,
      flag: lang.flag,
      avatar: '👤',
      messages: [],
      lastMessage: '',
      lastTime: '',
    });
    setNewPartnerName('');
    setNewPartnerLanguage('英語');
    setShowAddPartner(false);
    setCurrentPartnerId(created.id);
    navigation.navigate('Chat', { partnerId: created.id });
  };

  return (
    <View style={styles.container}>
      {/* 検索＆追加 */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="検索"
          placeholderTextColor="#9CA3AF"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity onPress={() => setShowAddPartner(true)}>
          <LinearGradient
            colors={['#E2F0CB', '#B5EAD7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>＋ 追加</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* タグ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow} contentContainerStyle={styles.tagRowContent}>
        {tags.map(tag => (
          <TouchableOpacity
            key={tag.id}
            style={[styles.tagChip, selectedTag === tag.id && styles.tagChipActive]}
            onPress={() => setSelectedTag(tag.id)}
            onLongPress={() => {
              if (tag.isDefault) return;
              setEditingTagId(tag.id);
              setEditingTagName(tag.name);
            }}
          >
            <Text style={[styles.tagChipText, selectedTag === tag.id && styles.tagChipTextActive]}>
              {tag.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.tagAddChip} onPress={() => setShowAddTag(true)}>
          <Text style={styles.tagAddChipText}>＋ タグ</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* パートナー一覧 */}
      <FlatList
        data={filteredPartners}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setCurrentPartnerId(item.id);
              navigation.navigate('Chat', { partnerId: item.id });
            }}
            onLongPress={() => openPartnerMenu(item.id)}
            style={[styles.partnerItem, item.isPinned && styles.partnerItemPinned]}
          >
            <View style={styles.partnerAvatarOuter}>
              {item.avatarImage ? (
                <Image source={{ uri: item.avatarImage }} style={styles.partnerAvatarImage} />
              ) : (
                <LinearGradient
                  colors={['#FFDAC1', '#E2F0CB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.partnerAvatar}
                >
                  <Text style={styles.partnerAvatarText}>{item.avatar}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName}>{item.name}</Text>
              <Text style={styles.partnerLast} numberOfLines={1}>{item.lastMessage || 'メッセージはまだありません'}</Text>
            </View>
            <View style={styles.partnerMeta}>
              <Text style={styles.partnerTime}>{item.lastTime}</Text>
              {item.isPinned && <Pin size={12} color="#B5EAD7" strokeWidth={2.5} />}
            </View>
          </Pressable>
        )}
      />

      {/* パートナー追加モーダル */}
      <Modal visible={showAddPartner} transparent animationType="fade" onRequestClose={() => setShowAddPartner(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>新しい相手を追加</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="相手の名前"
              placeholderTextColor="#9CA3AF"
              value={newPartnerName}
              onChangeText={setNewPartnerName}
            />
            <Text style={styles.modalSectionLabel}>言語</Text>
            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map(l => (
                <TouchableOpacity
                  key={l.name}
                  onPress={() => setNewPartnerLanguage(l.name)}
                  style={[styles.languageItem, newPartnerLanguage === l.name && styles.languageItemActive]}
                >
                  <Text style={[styles.languageItemText, newPartnerLanguage === l.name && styles.languageItemTextActive]}>
                    {l.flag} {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddPartner(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePartner} style={{ flex: 1 }}>
                <LinearGradient
                  colors={['#E2F0CB', '#B5EAD7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.btnSave}
                >
                  <Text style={styles.btnSaveText}>保存</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* パートナーメニュー */}
      <Modal visible={showPartnerMenu} transparent animationType="fade" onRequestClose={closePartnerMenu}>
        <Pressable style={styles.modalOverlay} onPress={closePartnerMenu}>
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuPartnerId !== null) togglePin(menuPartnerId);
                closePartnerMenu();
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pin size={16} color="#333" strokeWidth={2} />
                <Text style={styles.menuItemText}>ピン留め切替</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowTagPicker(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Tag size={16} color="#333" strokeWidth={2} />
                <Text style={styles.menuItemText}>タグを変更</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuDelete]} onPress={() => setShowDeleteConfirm(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                <Text style={[styles.menuItemText, styles.menuDeleteText]}>削除</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* タグ選択 */}
      <Modal visible={showTagPicker} transparent animationType="fade" onRequestClose={() => setShowTagPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>タグを変更</Text>
            {tags.filter(t => t.id !== 'all').map(tag => (
              <TouchableOpacity
                key={tag.id}
                style={styles.menuItem}
                onPress={() => {
                  if (menuPartnerId !== null) changePartnerTag(menuPartnerId, tag.id);
                  closePartnerMenu();
                }}
              >
                <Text style={styles.menuItemText}>{tag.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuPartnerId !== null) changePartnerTag(menuPartnerId, undefined);
                closePartnerMenu();
              }}
            >
              <Text style={styles.menuItemText}>なし</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 削除確認 */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>削除の確認</Text>
            <Text style={styles.modalSubText}>この相手を削除しますか？</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (menuPartnerId !== null) deletePartner(menuPartnerId);
                  closePartnerMenu();
                }}
                style={{ flex: 1 }}
              >
                <View style={[styles.btnSave, styles.btnDanger]}>
                  <Text style={styles.btnSaveText}>削除</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* タグ追加/編集 */}
      <Modal visible={showAddTag || editingTagId !== null} transparent animationType="fade" onRequestClose={() => { setShowAddTag(false); setEditingTagId(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTagId ? 'タグを編集' : 'タグを追加'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="タグ名"
              placeholderTextColor="#9CA3AF"
              value={editingTagId ? editingTagName : newTagName}
              onChangeText={editingTagId ? setEditingTagName : setNewTagName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => { setShowAddTag(false); setEditingTagId(null); }} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (editingTagId) {
                    editTag(editingTagId, editingTagName);
                    setEditingTagId(null);
                  } else {
                    addTag(newTagName);
                    setNewTagName('');
                    setShowAddTag(false);
                  }
                }}
                style={{ flex: 1 }}
              >
                <LinearGradient
                  colors={['#E2F0CB', '#B5EAD7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.btnSave}
                >
                  <Text style={styles.btnSaveText}>保存</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            {editingTagId && (
              <TouchableOpacity
                onPress={() => {
                  deleteTag(editingTagId);
                  setEditingTagId(null);
                }}
                style={[styles.btnDangerFull]}
              >
                <Text style={styles.btnDangerFullText}>このタグを削除</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* FABボタン */}
      <TouchableOpacity
        style={styles.fabButton}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#B5EAD7', '#C7CEEA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Home size={24} color="white" strokeWidth={2.5} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  // 検索
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Quicksand_500Medium',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: 'rgba(181, 234, 215, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  addButtonText: {
    fontWeight: '600',
    color: '#333',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  // タグ
  tagRow: {
    flexGrow: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(74, 85, 104, 0.05)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  tagRowContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  tagChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(255, 183, 178, 0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    fontFamily: 'Quicksand_600SemiBold',
  },
  tagChipTextActive: {
    color: '#333',
  },
  tagAddChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
  },
  tagAddChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    fontFamily: 'Quicksand_600SemiBold',
  },
  // リスト
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  partnerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: 'rgba(74, 85, 104, 0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  partnerItemPinned: {
    borderLeftWidth: 3,
    borderLeftColor: '#B5EAD7',
  },
  partnerAvatarOuter: {
    width: 52,
    height: 52,
  },
  partnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: {
    fontSize: 28,
    fontFamily: 'Quicksand_400Regular',
  },
  partnerAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontWeight: '700',
    fontSize: 16,
    color: '#333',
    fontFamily: 'Quicksand_700Bold',
  },
  partnerLast: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    fontFamily: 'Quicksand_500Medium',
  },
  partnerMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  partnerTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    fontFamily: 'Quicksand_500Medium',
  },
  pinIcon: {
    fontSize: 12,
    fontFamily: 'Quicksand_400Regular',
  },
  // モーダル共通
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: 'rgba(74, 85, 104, 0.08)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    color: '#333',
    textAlign: 'center',
    fontFamily: 'Quicksand_700Bold',
  },
  modalSubText: {
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'Quicksand_400Regular',
  },
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
    fontFamily: 'Quicksand_600SemiBold',
  },
  modalInput: {
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 20,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Quicksand_500Medium',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#333',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Quicksand_700Bold',
  },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnSaveText: {
    color: '#333',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Quicksand_700Bold',
  },
  btnDanger: {
    backgroundColor: '#FFB7B2',
  },
  btnDangerFull: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDangerFullText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  // 言語リスト
  languageList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  languageItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  languageItemActive: {
    backgroundColor: '#E2F0CB',
    borderWidth: 1,
    borderColor: '#B5EAD7',
  },
  languageItemText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  languageItemTextActive: {
    color: '#333',
  },
  // メニューシート
  menuSheet: {
    marginTop: 'auto',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 8,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  menuItemText: {
    fontWeight: '600',
    color: '#333',
    fontSize: 16,
    fontFamily: 'Quicksand_600SemiBold',
  },
  menuDelete: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 4,
  },
  menuDeleteText: {
    color: '#EF4444',
  },
  // FABボタン
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: 'rgba(181, 234, 215, 0.5)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 24,
    fontFamily: 'Quicksand_400Regular',
  },
});
