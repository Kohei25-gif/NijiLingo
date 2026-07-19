# App Store提出 手順書（君がやる部分）

## ① Vercel環境変数（5分・最優先）
プロキシ認証を有効化する。
1. https://vercel.com → niji-chat プロジェクト → Settings → Environment Variables
2. 追加: `APP_PROXY_TOKEN` = `351705f0609e6512eb1001b024b6f1ca4ca0b169e50fa440`（All Environments）
3. Deployments → 最新デプロイの「...」→ Redeploy（env反映のため）
※これをやるまでプロキシは認証なしで通る（旧アプリ互換のための設計）。急がなくても壊れないが、今日中推奨。
※ついでに `OPENAI_API_KEY` はもう使わないので削除してOK。

## ② EASログイン（2分）
ターミナルで:
```
cd /Users/takakikohei/NijiLingo
eas login
```
Expoアカウント（なければ https://expo.dev で無料登録）でログイン。

## ③ ビルド&提出（俺がコマンドを流す。Apple認証だけ君）
`eas build --platform ios --profile production` 実行中に:
- Apple IDログインを求められる → 君のApple Developerアカウントでログイン
- 証明書・プロビジョニングは「EASに任せる」でOK（全部Yes）
ビルドは Expo のクラウドで15〜30分。完了後 `eas submit -p ios` でApp Store Connectへ。

## ④ App Store Connect設定（15分）
https://appstoreconnect.apple.com
1. マイApp → 「+」→ 新規App
   - プラットフォーム: iOS / 名前: NijiLingo / プライマリ言語: 日本語
   - バンドルID: com.benihei.nijilingo（②のビルドで自動登録される。出てこなければビルド完了を待つ）
   - SKU: nijilingo-001
2. メタデータを `store/metadata.md` からコピペ（説明文・キーワード・URL・カテゴリ）
3. App Privacy: 「データを収集しない」ではなく→「ユーザーコンテンツ（その他）」収集あり・アプリ機能目的・紐付けなし・トラッキングなし
4. 価格: 無料
5. スクリーンショット（下記⑤）をアップ
6. ビルドを選択 → 審査へ提出

## ⑤ スクリーンショット（10分）
必須: 6.7インチ（iPhone 15 Pro Max等、1290×2796px）を最低1枚、推奨3〜5枚。
君のiPhoneで撮るのが早い（設定→画面収録でもスクショでもOK）:
1. 翻訳プレビュー画面（スライダー+翻訳+逆翻訳が写ってるやつ）
2. ニュアンス調整でカジュアル/ていねいの差が見える画面
3. 解説が開いてる画面
4. トークルーム or 対面モード
※iPhoneのサイズが6.7インチでない場合は言って。シミュレータで撮る手順を出す。

## 審査に落ちた時のリスク箇所（想定済み）
- 対面モード/トークルームの🔒ロック（ガイドライン2.1）→ リジェクトされたら「ロック外して全部無料」に切り替えて再提出（コード修正10分+再ビルド）
