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
- 本格的なモジュール別ブロックは今後追加します
- `https://xcratch.github.io` から `http://localhost` や `http://[::1]` を直接読むと、ブラウザの Private Network Access 制限で失敗します
- そのため、実運用と確認は GitHub Pages などの公開 URL で行います
