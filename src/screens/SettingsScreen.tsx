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
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
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

      {/* アバタープレビュー */}
      <View style={styles.avatarPreview}>
        {editAvatarImage ? (
          <Image source={{ uri: editAvatarImage }} style={styles.avatarImage} />
        ) : (
          <LinearGradient
            colors={['#FFDAC1', '#E2F0CB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarEmojiContainer}
          >
            <Text style={styles.avatarEmoji}>{editAvatar || '👤'}</Text>
          </LinearGradient>
        )}
      </View>

      {/* 絵文字アイコン */}
      <Text style={styles.sectionLabel}>絵文字アイコン</Text>
      <View style={styles.avatarOptions}>
        {AVATAR_OPTIONS.map(avatar => (
          <TouchableOpacity
            key={avatar}
            onPress={() => { setEditAvatar(avatar); setEditAvatarImage(null); }}
            style={[
              styles.avatarOption,
              editAvatar === avatar && !editAvatarImage && styles.avatarOptionActive,
            ]}
          >
            <Text style={styles.avatarOptionText}>{avatar}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 画像アップロード */}
      <Text style={styles.sectionLabel}>画像をアップロード</Text>
      <TouchableOpacity onPress={handleImagePick} style={styles.uploadBtn}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Camera size={16} color="#9CA3AF" strokeWidth={2} />
          <Text style={styles.uploadBtnText}>画像を選択</Text>
        </View>
      </TouchableOpacity>
      {editAvatarImage && (
        <TouchableOpacity
          onPress={() => { setEditAvatarImage(null); setEditAvatar('👤'); }}
          style={styles.removeImageBtn}
        >
          <Text style={styles.removeImageBtnText}>画像を削除</Text>
        </TouchableOpacity>
      )}

      {/* 名前 */}
      <Text style={styles.sectionLabel}>名前</Text>
      <TextInput
        style={styles.input}
        value={editName}
        onChangeText={setEditName}
        placeholderTextColor="#9CA3AF"
      />

      {/* 言語 */}
      <Text style={styles.sectionLabel}>言語</Text>
      <View style={styles.languageList}>
        {LANGUAGE_OPTIONS.map(lang => (
          <TouchableOpacity
            key={lang.name}
            onPress={() => setEditLanguage(lang.name)}
            style={[styles.languageItem, editLanguage === lang.name && styles.languageItemActive]}
          >
            <Text style={[styles.languageItemText, editLanguage === lang.name && styles.languageItemTextActive]}>
              {lang.flag} {lang.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* タグ */}
      <Text style={styles.sectionLabel}>タグ</Text>
      <View style={styles.tagList}>
        <TouchableOpacity
          onPress={() => setEditTag('')}
          style={[styles.tagItem, !editTag && styles.tagItemActive]}
        >
          <Text style={[styles.tagItemText, !editTag && styles.tagItemTextActive]}>なし</Text>
        </TouchableOpacity>
        {tags.filter(t => t.id !== 'all').map(tag => (
          <TouchableOpacity
            key={tag.id}
            onPress={() => setEditTag(tag.id)}
            style={[styles.tagItem, editTag === tag.id && styles.tagItemActive]}
          >
            <Text style={[styles.tagItemText, editTag === tag.id && styles.tagItemTextActive]}>{tag.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ボタン */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtnTouchable}>
          <LinearGradient
            colors={['#E2F0CB', '#B5EAD7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>保存</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7F2',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'Quicksand_700Bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#9CA3AF',
  },
  // アバタープレビュー
  avatarPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarEmojiContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarEmoji: {
    fontSize: 36,
    fontFamily: 'Quicksand_400Regular',
  },
  // セクションラベル
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 20,
    marginBottom: 8,
    fontFamily: 'Quicksand_600SemiBold',
  },
  // アバターオプション
  avatarOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarOptionActive: {
    backgroundColor: '#E2F0CB',
    borderColor: '#B5EAD7',
  },
  avatarOptionText: {
    fontSize: 24,
    fontFamily: 'Quicksand_400Regular',
  },
  // 画像アップロード
  uploadBtn: {
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E5E5E5',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: {
    fontWeight: '600',
    color: '#9CA3AF',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  removeImageBtn: {
    marginTop: 10,
    alignItems: 'center',
  },
  removeImageBtnText: {
    fontWeight: '600',
    color: '#EF4444',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  // 名前入力
  input: {
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: 'Quicksand_500Medium',
  },
  // 言語リスト
  languageList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    fontWeight: '600',
    color: '#333',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  languageItemTextActive: {
    color: '#333',
  },
  // タグリスト
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  tagItemActive: {
    backgroundColor: '#E2F0CB',
    borderWidth: 1,
    borderColor: '#B5EAD7',
  },
  tagItemText: {
    fontWeight: '600',
    color: '#333',
    fontSize: 14,
    fontFamily: 'Quicksand_600SemiBold',
  },
  tagItemTextActive: {
    color: '#333',
  },
  // アクションボタン
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontWeight: '700',
    color: '#333',
    fontSize: 16,
    fontFamily: 'Quicksand_700Bold',
  },
  saveBtnTouchable: {
    flex: 1,
    borderRadius: 16,
    shadowColor: 'rgba(181, 234, 215, 0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontWeight: '700',
    color: '#333',
    fontSize: 16,
    fontFamily: 'Quicksand_700Bold',
  },
});
