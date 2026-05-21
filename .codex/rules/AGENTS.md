# Frontend Development Rules

이 프로젝트의 프론트엔드 코드는 기능 단위로 정리한다.
AI는 작업을 시작하기 전에 이 규칙을 먼저 확인하고, 새 코드나 리팩터링에 반드시 반영한다.

## 기본 원칙

- 하나의 파일에 모든 로직과 UI를 몰아넣지 않는다.
- 페이지 파일은 화면을 조립하는 역할만 한다.
- 기능별 코드는 `features` 폴더 아래에 모은다.
- 공용 UI만 `components/ui`에 둔다.
- 특정 기능에서만 쓰는 컴포넌트는 해당 feature 내부에 둔다.
- 데이터 요청, 상태 관리, 계산 로직, 타입 정의는 가능한 한 분리한다.
- 기존 동작과 스타일은 요청 없이 바꾸지 않는다.
- 불필요한 추상화는 만들지 않는다.
- 파일이 너무 커지면 역할별로 분리한다.

## 추천 구조

```txt
src/
  app/ or pages/
    DashboardPage.tsx

  features/
    dashboard/
      components/
        StatsCard.tsx
        ActivityList.tsx
      hooks/
        useDashboardData.ts
      api.ts
      types.ts
      index.ts

  components/
    ui/
      Button.tsx
      Modal.tsx
      Input.tsx
    layout/
      Header.tsx
      Sidebar.tsx

  lib/
    format.ts
    constants.ts

  styles/
    globals.css
```

## Page 컴포넌트 규칙

페이지 컴포넌트는 다음 역할만 가진다.

- 주요 섹션 배치
- feature 컴포넌트 조립
- 페이지 단위 라우팅/레이아웃 처리
- 필요한 hook 호출

페이지 파일 안에 다음 내용을 과도하게 넣지 않는다.

- 긴 JSX
- API 요청 함수
- 복잡한 필터/정렬/계산 로직
- 모달, 테이블, 카드 등의 세부 UI 구현
- 반복되는 UI 컴포넌트 정의

## Feature 폴더 규칙

기능 단위 코드는 다음처럼 구성한다.

```txt
features/user/
  components/
    UserTable.tsx
    UserFilters.tsx
    UserDetailModal.tsx
  hooks/
    useUsers.ts
  api.ts
  types.ts
  utils.ts
  index.ts
```

각 파일의 역할은 다음과 같다.

- `components/`: 해당 기능에서만 쓰는 UI
- `hooks/`: 데이터 조회, 상태 관리, UI 로직
- `api.ts`: 서버 요청 함수
- `types.ts`: 타입 정의
- `utils.ts`: 순수 계산/포맷 함수
- `index.ts`: 외부 export 정리

## 공용 컴포넌트 규칙

`components/ui`에는 여러 기능에서 반복 사용되는 순수 UI만 둔다.

예:

- Button
- Input
- Select
- Modal
- Tabs
- Checkbox
- Tooltip
- Card

특정 기능 이름이 들어가는 컴포넌트는 공용으로 빼지 않는다.

좋지 않은 예:

```txt
components/ui/UserStatsCard.tsx
components/ui/PaymentHistoryTable.tsx
```

좋은 예:

```txt
features/user/components/UserStatsCard.tsx
features/payment/components/PaymentHistoryTable.tsx
```

## 분리 기준

다음 조건 중 하나라도 해당하면 파일 분리를 고려한다.

- 한 파일이 200~300줄 이상이다.
- JSX가 너무 깊어져서 읽기 어렵다.
- API 요청과 UI 렌더링이 한 파일에 섞여 있다.
- 상태 관리 코드가 UI보다 길다.
- 같은 UI 패턴이 2번 이상 반복된다.
- 하나의 컴포넌트가 여러 책임을 가진다.

## AI 작업 규칙

AI는 새 기능을 만들 때 다음 순서로 작업한다.

1. 기존 폴더 구조와 네이밍 규칙을 먼저 확인한다.
2. 비슷한 feature가 있으면 그 구조를 따른다.
3. 새 코드를 한 파일에 몰아넣지 않는다.
4. page, component, hook, api, type을 역할에 맞게 나눈다.
5. 기존 스타일과 UI 패턴을 유지한다.
6. 변경 범위를 요청된 기능 주변으로 제한한다.
7. 리팩터링 시 기존 동작을 바꾸지 않는다.
8. 작업 후 어떤 파일을 어떤 이유로 나눴는지 요약한다.

## AI에게 줄 기본 작업 지시문

작업을 시작하기 전에 항상 다음 지시를 따른다.

```txt
작업 전에 AGENTS.md의 프론트엔드 구조 규칙을 먼저 읽고 따라줘.

새 기능이나 리팩터링을 할 때:
- 코드를 한 파일에 몰아넣지 말 것
- 페이지 컴포넌트는 조립 역할만 하게 할 것
- 기능별 코드는 features 폴더 아래에 둘 것
- 공용 UI만 components/ui에 둘 것
- 데이터 요청은 api.ts 또는 hook으로 분리할 것
- 타입은 types.ts로 분리할 것
- 기존 동작과 스타일은 요청 없이 바꾸지 말 것
- 변경 후 파일별 역할을 짧게 설명할 것
```
