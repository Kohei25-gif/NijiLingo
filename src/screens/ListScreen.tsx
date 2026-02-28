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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppData } from '../context/AppDataContext';
import { LANGUAGE_OPTIONS } from '../constants/languages';

type RootStackParamList = {
  List: undefined;
  Chat: { partnerId: number };
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
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddPartner(true)}>
          <Text style={styles.addButtonText}>追加</Text>
        </TouchableOpacity>
      </View>

      {/* タグ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
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
            <View style={styles.partnerAvatar}>
              {item.avatarImage ? (
                <Image source={{ uri: item.avatarImage }} style={styles.partnerAvatarImage} />
              ) : (
                <Text style={styles.partnerAvatarText}>{item.avatar}</Text>
              )}
            </View>
            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName}>{item.name}</Text>
              <Text style={styles.partnerLast}>{item.lastMessage || 'メッセージはまだありません'}</Text>
            </View>
            <View style={styles.partnerMeta}>
              <Text style={styles.partnerTime}>{item.lastTime}</Text>
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
              value={newPartnerName}
              onChangeText={setNewPartnerName}
            />
            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map(l => (
                <TouchableOpacity
                  key={l.name}
                  onPress={() => setNewPartnerLanguage(l.name)}
                  style={[styles.languageItem, newPartnerLanguage === l.name && styles.languageItemActive]}
                >
                  <Text style={styles.languageItemText}>{l.flag} {l.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddPartner(false)} style={styles.btnCancel}>
                <Text style={styles.btnCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePartner} style={styles.btnSave}>
                <Text style={styles.btnSaveText}>保存</Text>
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
              <Text style={styles.menuItemText}>ピン留め切替</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowTagPicker(true)}>
              <Text style={styles.menuItemText}>タグを変更</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuDelete]} onPress={() => setShowDeleteConfirm(true)}>
              <Text style={[styles.menuItemText, styles.menuDeleteText]}>削除</Text>
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
                style={[styles.btnSave, styles.btnDanger]}
              >
                <Text style={styles.btnSaveText}>削除</Text>
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
                style={styles.btnSave}
              >
                <Text style={styles.btnSaveText}>保存</Text>
              </TouchableOpacity>
            </View>
            {editingTagId && (
              <TouchableOpacity
                onPress={() => {
                  deleteTag(editingTagId);
                  setEditingTagId(null);
                }}
                style={[styles.btnSave, styles.btnDanger, { marginTop: 8 }]}
              >
                <Text style={styles.btnSaveText}>削除</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F7F2', padding: 16 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  addButton: { backgroundColor: '#B5EAD7', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addButtonText: { fontWeight: '600', color: '#333' },
  tagRow: { flexGrow: 0, marginBottom: 12 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F2F5', marginRight: 8 },
  tagChipActive: { backgroundColor: '#B5EAD7' },
  tagChipText: { fontSize: 12, fontWeight: '600', color: '#333' },
  tagChipTextActive: { color: '#333' },
  tagAddChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ddd' },
  tagAddChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  listContent: { paddingBottom: 20 },
  partnerItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  partnerItemPinned: { borderColor: '#F0A050', backgroundColor: '#FFF3CD' },
  partnerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F2F5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  partnerAvatarText: { fontSize: 18 },
  partnerAvatarImage: { width: 36, height: 36, borderRadius: 18 },
  partnerInfo: { flex: 1 },
  partnerName: { fontWeight: '600', color: '#333' },
  partnerLast: { color: '#999', fontSize: 12, marginTop: 2 },
  partnerMeta: { marginLeft: 8 },
  partnerTime: { fontSize: 11, color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: '#333' },
  modalSubText: { color: '#666', marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btnCancel: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#F3F4F6' },
  btnCancelText: { color: '#666', fontWeight: '600' },
  btnSave: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#B5EAD7' },
  btnSaveText: { color: '#333', fontWeight: '600' },
  btnDanger: { backgroundColor: '#FFB7B2' },
  languageList: { maxHeight: 180, marginBottom: 8 },
  languageItem: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  languageItemActive: { backgroundColor: '#F0F2F5' },
  languageItemText: { color: '#333' },
  menuSheet: { marginTop: 'auto', backgroundColor: '#fff', borderRadius: 12, padding: 8 },
  menuItem: { paddingVertical: 12, paddingHorizontal: 12 },
  menuItemText: { fontWeight: '600', color: '#333' },
  menuDelete: { borderTopWidth: 1, borderTopColor: '#eee' },
  menuDeleteText: { color: '#cc0000' },
});
