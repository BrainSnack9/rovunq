# Codex Handoff Memo

이 파일은 새 Codex 채팅에서 이전 대화 맥락을 이어받기 위한 인수인계 메모다.
새 채팅을 시작하면 먼저 이 파일과 `AGENTS.md`를 읽고 작업을 이어가면 된다.

## 현재 상황

- 사용자는 프론트엔드 코드를 AI가 한 파일에 몰아넣는 문제를 줄이고 싶어 한다.
- 목표는 프론트엔드 작업 전에 항상 구조 규칙을 참조하게 만드는 것이다.
- 프로젝트 경로는 `/Users/educere/Documents/rovunq`다.
- 기존 채팅의 작업 디렉토리는 `/Users/educere/Documents/New project 4`였는데, 해당 폴더가 없어져 Codex에서 "현재 작업 디렉토리가 없습니다" 메시지가 뜬 상태다.
- 대화를 유지하려면 기존 채팅에서 계속 설명을 이어갈 수 있지만, 새 채팅으로 갈 경우 이 파일을 읽으면 된다.

## 이미 완료한 작업

- `/Users/educere/Documents/rovunq/.codex/rules/AGENTS.md`에 프론트엔드 구조 규칙을 작성했다.
- 같은 취지의 규칙이 프로젝트 루트 `/Users/educere/Documents/rovunq/AGENTS.md`에도 존재한다.
- 규칙의 핵심은 다음과 같다.
  - 코드를 한 파일에 몰아넣지 않는다.
  - 페이지 컴포넌트는 조립 역할만 한다.
  - 기능별 코드는 `features` 아래에 둔다.
  - 공용 UI만 `components/ui`에 둔다.
  - 특정 기능 전용 컴포넌트는 해당 feature 내부에 둔다.
  - 데이터 요청, 상태 관리, 타입 정의, 계산 로직을 역할별로 분리한다.
  - 기존 동작과 스타일은 요청 없이 바꾸지 않는다.

## 다음 채팅에서 먼저 할 일

1. `/Users/educere/Documents/rovunq/AGENTS.md`를 읽는다.
2. `/Users/educere/Documents/rovunq/.codex/rules/AGENTS.md`를 읽는다.
3. 필요하면 이 파일 `/Users/educere/Documents/rovunq/.codex/HANDOFF.md`도 같이 읽는다.
4. 사용자가 프론트 작업을 요청하면 위 규칙을 기준으로 기존 구조를 먼저 확인한 뒤 작업한다.

## 새 채팅에 붙여넣을 시작 프롬프트

```txt
프로젝트는 /Users/educere/Documents/rovunq 입니다.
먼저 아래 파일들을 읽고 이전 맥락을 이어받아줘.

- /Users/educere/Documents/rovunq/.codex/HANDOFF.md
- /Users/educere/Documents/rovunq/AGENTS.md
- /Users/educere/Documents/rovunq/.codex/rules/AGENTS.md

프론트엔드 작업을 할 때는 코드를 한 파일에 몰아넣지 말고,
page, feature, component, hook, api, type 역할로 적절히 분리해줘.
기존 동작과 스타일은 요청 없이 바꾸지 말고,
작업 후 어떤 파일을 왜 나눴는지 짧게 설명해줘.
```

## 작업 시 주의점

- 기존 사용자가 만든 변경사항을 되돌리지 않는다.
- 먼저 `rg --files`와 기존 폴더 구조를 확인한다.
- 새 기능은 기존 프로젝트 패턴을 따른다.
- 파일이 200~300줄을 넘거나 책임이 섞이면 분리 후보로 본다.
- 공용 컴포넌트는 진짜 여러 곳에서 쓰이는 경우에만 `components/ui`로 이동한다.
