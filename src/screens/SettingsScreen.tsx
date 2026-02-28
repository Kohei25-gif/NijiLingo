import { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LANGUAGE_OPTIONS } from '../constants/languages';
import { useAppData } from '../context/AppDataContext';

type RootStackParamList = {
  Settings: { partnerId: number };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const AVATAR_OPTIONS = ['👨', '👩', '👨‍💼', '👩‍💼', '🧑', '👴', '👵', '🧔', '👱‍♀️', '👱‍♂️'];

export default function SettingsScreen({ route, navigation }: Props) {
  const { partners, tags, updatePartner } = useAppData();
  const partner = useMemo(() => partners.find(p => p.id === route.params.partnerId), [partners, route.params.partnerId]);

  const [editName, setEditName] = useState(partner?.name ?? '');
  const [editLanguage, setEditLanguage] = useState(partner?.language ?? '英語');
  const [editAvatar, setEditAvatar] = useState<string | null>(partner?.avatar ?? '👤');
  const [editAvatarImage, setEditAvatarImage] = useState<string | null>(partner?.avatarImage ?? null);
  const [editTag, setEditTag] = useState<string>(partner?.tag ?? '');

  const handleImagePick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64;
    if (base64) {
      const mime = asset.mimeType ?? 'image/jpeg';
      setEditAvatarImage(`data:${mime};base64,${base64}`);
    } else {
      setEditAvatarImage(asset.uri);
    }
    setEditAvatar(null);
  };

  const handleSave = () => {
    if (!partner) return;
    const langOption = LANGUAGE_OPTIONS.find(l => l.name === editLanguage) || LANGUAGE_OPTIONS[0];
    updatePartner(partner.id, {
      name: editName.trim() || partner.name,
      language: editLanguage,
      flag: langOption.flag,
      avatar: editAvatar || '👤',
      avatarImage: editAvatarImage,
      tag: editTag || undefined,
    });
    navigation.goBack();
  };

  if (!partner) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>相手が見つかりません。</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>相手の設定</Text>

      <View style={styles.avatarPreview}>
        {editAvatarImage ? (
          <Image source={{ uri: editAvatarImage }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarEmoji}>{editAvatar || '👤'}</Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>絵文字アイコン</Text>
      <View style={styles.avatarOptions}>
        {AVATAR_OPTIONS.map(avatar => (
          <TouchableOpacity
            key={avatar}
            onPress={() => { setEditAvatar(avatar); setEditAvatarImage(null); }}
            style={[styles.avatarOption, editAvatar === avatar && !editAvatarImage && styles.avatarOptionActive]}
          >
            <Text style={styles.avatarOptionText}>{avatar}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>画像をアップロード</Text>
      <View style={styles.imageButtons}>
        <TouchableOpacity onPress={handleImagePick} style={styles.imagePickBtn}>
          <Text style={styles.imagePickText}>画像を選択</Text>
        </TouchableOpacity>
        {editAvatarImage && (
          <TouchableOpacity
            onPress={() => { setEditAvatarImage(null); setEditAvatar('👤'); }}
            style={styles.imageRemoveBtn}
          >
            <Text style={styles.imageRemoveText}>画像を削除</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionLabel}>名前</Text>
      <TextInput style={styles.input} value={editName} onChangeText={setEditName} />

      <Text style={styles.sectionLabel}>言語</Text>
      <View style={styles.languageList}>
        {LANGUAGE_OPTIONS.map(lang => (
          <TouchableOpacity
            key={lang.name}
            onPress={() => setEditLanguage(lang.name)}
            style={[styles.languageItem, editLanguage === lang.name && styles.languageItemActive]}
          >
            <Text style={styles.languageItemText}>{lang.flag} {lang.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>タグ</Text>
      <View style={styles.tagList}>
        <TouchableOpacity
          onPress={() => setEditTag('')}
          style={[styles.tagItem, !editTag && styles.tagItemActive]}
        >
          <Text style={styles.tagItemText}>なし</Text>
        </TouchableOpacity>
        {tags.filter(t => t.id !== 'all').map(tag => (
          <TouchableOpacity
            key={tag.id}
            onPress={() => setEditTag(tag.id)}
            style={[styles.tagItem, editTag === tag.id && styles.tagItemActive]}
          >
            <Text style={styles.tagItemText}>{tag.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F7F2' },
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#9CA3AF' },
  avatarPreview: { alignItems: 'center', marginBottom: 16 },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarEmoji: { fontSize: 52 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginTop: 12, marginBottom: 6 },
  avatarOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarOption: { padding: 8, borderRadius: 12, backgroundColor: '#F3F4F6' },
  avatarOptionActive: { backgroundColor: '#B5EAD7' },
  avatarOptionText: { fontSize: 20 },
  imageButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  imagePickBtn: { backgroundColor: '#E2F0CB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  imagePickText: { fontWeight: '600', color: '#333' },
  imageRemoveBtn: { backgroundColor: '#FFE5E5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  imageRemoveText: { fontWeight: '600', color: '#cc0000' },
  input: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ddd' },
  languageList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageItem: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },
  languageItemActive: { backgroundColor: '#B5EAD7' },
  languageItemText: { fontWeight: '600', color: '#333' },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },
  tagItemActive: { backgroundColor: '#B5EAD7' },
  tagItemText: { fontWeight: '600', color: '#333' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#F3F4F6' },
  cancelBtnText: { fontWeight: '600', color: '#666' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#B5EAD7' },
  saveBtnText: { fontWeight: '600', color: '#333' },
});
