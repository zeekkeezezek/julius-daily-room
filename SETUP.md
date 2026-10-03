# DAILY ROOM専用Firebaseの接続状態

## 設定済み — 2026-10-04

- 専用プロジェクト：`julius-daily-room`（既存WORK ROOMとは別）。
- 君から渡されたWebアプリ設定を `public/firebase-config.json` と `dist/firebase-config.json` に反映。
- Google認証が有効であることをFirebase Consoleで確認。
- 君の承認を受け、Firestore `(default)` を東京 `asia-northeast1`、Standard edition、本番モードで作成。
- 同梱 `firestore.rules` を公開。Rules Playgroundで本人UIDの読み取り許可、未ログインと別UIDの読み取り拒否を確認。これはシミュレーションであり、実際の日記データはまだ保存していない。
- ローカル起動は承認済みドメイン `localhost` を使う。Googleログインはポップアップ方式。

通常は [公開版DAILY ROOM](https://zeekkeezezek.github.io/julius-daily-room/) を開いてGoogleログインする。ローカル版は `Start DAILY ROOM.cmd` で開く。旧試用版の `127.0.0.1` 側に記録がある場合は、そちらでJSONを書き出してlocalhost側へ移す。両者のブラウザ内保存先は異なる。試用記録は勝手にクラウドへ混ぜない。

## 保存とアクセス

`dailyRoom/{uid}/days/{YYYY-MM-DD}` に日付ごとに保存する。ログイン済みの本人UIDと同じ保存領域だけに読み書きを許可する。共有の日記領域や日記を公開する機能はない。

Firebase Web設定はブラウザへ渡る公開設定だ。設定ファイルはローカルGitでは追跡しないが、接続済みZIPには同梱している。サービスアカウントの秘密鍵やパスワードは含まない。アクセスを守るのはFirestore Rulesだ。

## GitHub Pagesへ公開済み — 2026-10-04

専用の [GitHubリポジトリ](https://github.com/zeekkeezezek/julius-daily-room) を新規作成してソースを公開した。GitHub Pagesの公開、PUBLIC_FIREBASE_CONFIGの登録、Firebase承認済みドメインへの zeekkeezezek.github.io の登録は済んでいる。

再公開する時の設定と操作は以下だ。

1. 新しいGitHubリポジトリへソースを置く。
2. リポジトリの「Settings → Secrets and variables → Actions → Variables」に `PUBLIC_FIREBASE_CONFIG` を作り、同梱のWeb設定と同じJSONを登録する。
3. Firebaseの「Authentication → Settings → Authorized domains」に `zeekkeezezek.github.io` を登録する。
4. GitHubの「Settings → Pages → Source」をGitHub Actionsにする。
5. 「Actions → Publish DAILY ROOM → Run workflow」を手動実行する。

公開URLは `https://zeekkeezezek.github.io/julius-daily-room/`。画面・アイコン・PWAはサブフォルダ配置に対応する。

## 残っている実接続の確認

1. 公開URLのGoogleログインとFirestore読み取り接続は確認済み。君の実際の日記と活動を保存して「保存済み」を確認する。
2. 実際のスマホで同じGoogleアカウントへログインし、同じ記録を確認する。
3. スマホで追加した活動がPCへ反映されることを確認する。
4. 通信を切って編集し、再接続後の同期を確認する。
5. 両端末で同じ日の異なる版を作り、同期の確認画面と両版の保持を確認する。
6. JSON復元、ホーム画面への追加と起動を実機で確認する。

ローカル画面の操作検証は使い捨てブラウザで行った。公開版はGoogleログインとFirestore読み取り接続まで確認した。君の実際の記録を使った書き込みやPC・スマホ間同期はまだ未確認だ。

公式の実装参考：[Googleログイン](https://firebase.google.com/docs/auth/web/google-signin)、[オフライン保存](https://firebase.google.com/docs/firestore/manage-data/enable-offline)、[トランザクション](https://firebase.google.com/docs/firestore/manage-data/transactions)。
