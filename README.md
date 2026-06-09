# Xcratch Grove Wrapper

Grove Shield for micro:bit 向けの Xcratch MOD 拡張です。

## 公開ファイル

- `dist/groveShieldWrapper.mjs`
  - Xcratch の `Extension Loader` で読む公開URL
- `xcratch-grove-wrapper.mjs`
  - 編集用の拡張本体
- `index.html`
  - GitHub Pages 用の案内ページ

## 読み込みURL

```text
https://mnakaue.github.io/Xcratch-microbitmore-extension/dist/groveShieldWrapper.mjs
```

## 位置づけ

- `microbitMore` を土台にしたラッパー拡張です
- 今の最小雛形は、Grove の基本入力/出力を分かりやすい名前で包むための土台です
- サーボは `角度だけ` と `何秒かけて動かす` の 2 種類を用意しています
- `microbitMore` と同様に、接続状態ボタンから micro:bit の Bluetooth 接続導線を出します
- 接続処理は `microbitMore` の peripheral 実装を共有して使います
- `scan` / `connect` / `disconnect` も Wrapper から明示委譲しています
- 本格的なモジュール別ブロックは今後追加します
- `https://xcratch.github.io` から `http://localhost` や `http://[::1]` を直接読むと、ブラウザの Private Network Access 制限で失敗します
- そのため、実運用と確認は GitHub Pages などの公開 URL で行います
