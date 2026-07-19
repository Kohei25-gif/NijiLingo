// フィーチャーフラグ
// P24: v1はプレミアム機能（トークルーム/対面モード/相手設定）を非表示で提出する。
// 「近日解放予定」のロック表示は審査ガイドライン2.1（未実装機能）のリジェクト対象になりやすいため、
// v1.1でIAP実装と同時に true に戻して課金ロックとして解放する。
// 実装コード（ListScreen/ChatScreen/FaceToFaceScreen/SettingsScreen）は温存されている。
export const PREMIUM_FEATURES_ENABLED = false;
