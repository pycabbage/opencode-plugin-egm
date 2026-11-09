# Phase 0 スパイク結果（D1–D7）

- 実施日: 2026-11-09
- 環境: OpenCode v2.2.6、モデル `opencode-go/crouton-alpha-free`
- 位置づけ: 設計書 §11 Phase 0 の関門判定。実験は使い捨てディレクトリ
  （`~/workspace/phase0/`）で実施した。

## D1 委譲インターフェース → 候補 (a) を採用、(b) は不採用

### (a) サブエージェント派遣（採用）

- プライマリが `subagent` ツール（入力: agent / description / prompt）で
  レビュアーを派遣し、foreground で結果が返ることを実測した。
- 子セッションは新規に作られ、`parentID` で親と結ばれる（session.list で確認）。
- 親だけに置いたマーカー文字列（`SECRET_MARKER_BOSS_7392`）は子の文脈に
  渡らず、レビュアーは `NO_MARKER_KNOWN` と報告した（L1 の実地確認）。
- 子の user メッセージは派遣プロンプトのみで、親の履歴は含まれない
  （子セッション export で確認）。

### (b) session.generate（不採用）

- API の存在と sessionID 必須、本文形式 `{prompt: string, model: {providerID,
  modelID}}`、非永続化（生成後に session export の messages が 0 件で、
  プロンプトも出力も残らない）を確認した。
- しかしファイル読み取りを要するプロンプトでは応答が空になり、ツール
  ループが回らないことが分かった。不変条件 3（レビュアーが権限制御の下で
  自分で読む）を満たさないため、設計書 D1 の規定どおり不採用とする。
  呼び出し間のマーカー漏洩は無かった（`NO_MARKER_KNOWN`）が、(ii) の
  不成立で十分条件を欠く。

## D2 権限モデル → 正典形式で確定

- v2 の正典形式は `agents: { <id>: { system, mode, permissions: [...] } }`。
  `permissions` は `{action, resource, effect}` の順序付きルール列。
- `opencode debug agents` の実効ダンプで次を確認した。
  - 先頭にホスト既定（`* allow`、`read *.env ask`、`read *.env.* ask`、
    `read *.env.example allow`）が入り、その後にエージェントのルールが
    追加され、末尾に browser 系 deny が付く。最終一致が勝つ前提で、
    「`* deny` を先頭に置く自前ルール列」は既定の後に追加されるため
    実効する。
  - したがってレビュアーの実効権限は debug agents のダンプで機械的に
    検証できる（§6.5 の起動前検査はこの形式で実装する）。

## D3 登録経路 → config ファイルで確定

- agents / commands は生成 config の `agents` / `commands` で登録できる。
- skills は `skills: [絶対パス...]`（ディレクトリの配列）で公開でき、
  frontmatter の `name` で呼び出せることを実測した（プローブスキルが
  コードワードを返した）。

## D4 設定の配置と分離 → 起動プロファイルで確定

- プロジェクトルートの `opencode.json` と `.opencode/opencode.json` は
  探索される。
- `OPENCODE_CONFIG` は常駐サービス経由では効かない（サービス起動時の
  環境で固定される）が、`--standalone` のプライベートサーバーでは
  有効だった。
- 確定した起動プロファイル:
  `OPENCODE_CONFIG=<宛先>/opencode.json OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode --standalone`
  この組合せではプロジェクト config が混ざらないことを実測した
  （マーカーエージェントのみ出現し、プロジェクト側エージェントは不在）。
- グローバル設定（既定 XDG）はこのプロファイルでもマージされうるため、
  §6.5 の起動前検査（実効ダンプ照合）で担保する。

## D5 トレース取得 → export で verifier 実装可能

- `opencode session export <id>` は `{info, messages}` を返し、info に
  agent / model / 時刻、session.list には parentID が含まれる。
- 親 export には `subagent` ツール呼び出し（agent、prompt、完了状態）が、
  子 export には `read` ツール呼び出し（path、完了状態、内容）が残る。
- よって §7.4 の突き合わせ（新規派遣、親子対応、レビュアー種別、必須
  read、結果対応、マーカー不在）はこの形式で実装できる。

## D6 質問ツール → スキーマに存在

- 権限アクションとして `question` が config スキーマに存在する。
  承認ゲートの実挙動は Phase 3 の E2E で確認し、使えない場合は平文で
  停止する（設計書のフォールバック）。

## D7 policies → 機構は有効、リソース名の列挙が前提

- `policies: [{action: "tool.use", resource: "*", effect: "deny"}]` は
  allow-all エージェントのツール実行も `Blocked by configuration policy`
  で拒否した（hard-deny として機能する）。
- 一方 `resource: "edit"` ではファイル作成が拒否されなかった。ツール名と
  リソース名の対応付けが別途必要であり、v0.1 ではエージェントのルール列と
  起動前検査を主手段とし、policies は任意の追加防御として将来検討する。

## 関門判定

- D1: (a) で成立 → **go**
- D2: 正典形式で読み取り専用を表現可能 → **go**
- D3: config 登録で成立 → **go**
- D4: 起動プロファイルで分離可能 → **go**
- D5: export で証跡が取れる → **go**
- 以上より Phase 1（最小実装）へ進む。
