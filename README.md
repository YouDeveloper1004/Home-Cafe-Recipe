# Cafe

Expo SDK 57 커피 레시피 앱. 진입점: `index.ts → App.tsx → CafeApp.tsx`.

## 실행과 검사

```sh
pnpm install
pnpm ios
pnpm test
pnpm typecheck
```

## 구현된 흐름

- 비회원 탐색/추출, 이름으로 로컬 프로필 만들기
- Cafe 개설/수정, Cafe별 프로필 및 실제 소유 레시피 목록
- 제목/설명/Cafe/도구 검색, 팔로우 피드, 저장 목록
- 첫 화면에서 이름·설명·재료·필요 도구와 추천 원두 제품(로스터·원산지·가공 방식·사용량)을 작성한 뒤, 설명·사진·영상·타이머로 구성된 단계를 원하는 만큼 하나씩 추가하는 동적 등록 흐름
- 레시피 표지 사진과 단계별 사진 또는 30초·10MB 이하 영상 첨부, 수행/대기 단계 추가/편집/삭제/순서 변경
- 초안 저장/재개, 게시/수정/삭제, 텍스트 공유
- 게시 레시피의 실제 단계 실행, 연속 탭 방지, 이전 단계, 자동 타이머, 일시정지, 10초 추가, 건너뛰기, 진동, 화면 유지
- 별점과 맛 기록, 재시작 복원, 저장 실패 처리
- Cafe 뒤로 가기는 홈/검색/저장/프로필로 복귀
- Cafe·레시피 신고, Cafe 차단 및 차단 콘텐츠 피드 제외
- Apple·Google 로그인, 만 14세 이상 확인, 이용약관·개인정보·국외이전 개별 동의
- 인앱 개인정보처리방침·이용약관·국외이전 안내·커뮤니티 정책, 온라인 계정과 첨부 파일 삭제
- 새 레시피와 수정 레시피의 공개 전 검토 상태, 서버 금칙어 검사, 신고 중복·시간당 제출 제한
- 업로드 이미지 재인코딩(EXIF 제거)과 사용하지 않는 원격 첨부 정리

기존 `@cafe/creator-data/v1` 데이터를 새 저장소로 읽어옵니다. 로컬 프로필에 Google 로그인 상태를 표시하지 않습니다. 온라인 계정 기록과 로컬 기록은 별도입니다.

## 온라인 연결

Supabase 무료 프로젝트가 연결되어 있고 초기 스키마, 공개 이미지 버킷, RLS 정책과 저장 RPC가 적용되어 있습니다. Google OAuth 공급자와 앱 콜백도 활성화되어 있으며 Google OAuth 앱은 테스트 모드입니다. 비밀 키는 저장소가 아닌 `.env.local`에만 보관합니다.

새 Supabase 프로젝트로 이전할 때만 다음 설정을 다시 수행합니다.

1. 새 프로젝트는 `supabase/schema.sql`을 실행한 뒤 `supabase/migrations/20260918_moderation_privacy.sql`을 실행합니다. 기존 프로젝트는 `supabase/migrations/20260918_release_readiness.sql`, `supabase/migrations/20260918_moderation_privacy.sql` 순서로 SQL Editor에서 실행합니다.
2. `.env.example`을 참고해 `.env.local`에 프로젝트 URL과 publishable key를 설정합니다. **service-role key는 앱에 넣지 않습니다.**
3. Google OAuth 공급자를 등록하고 Supabase Site URL과 Redirect URL을 모두 `caferecipes://auth/callback`으로 설정합니다.
4. 환경 변수를 적용해 Metro를 다시 시작하고 개발 빌드에서 인증을 검사합니다.

Google은 PKCE로 인증하고 Apple은 네이티브 identity token을 Supabase에 전달합니다. 세션은 SecureStore에 저장합니다. 개인 상태는 본인만 조회할 수 있고, Cafe/게시 레시피는 공개 카탈로그에 분리됩니다. 신고는 작성자만 제출할 수 있고 일반 사용자는 조회할 수 없습니다. 차단 목록은 본인만 읽고 추가·삭제할 수 있습니다.

사진과 단계 영상은 본인 UID 폴더에 업로드합니다. 이미지는 업로드 전에 JPEG로 재인코딩해 원본 EXIF 위치 메타데이터를 제거하고, 저장 후 현재 레시피에서 참조하지 않는 본인 폴더 파일을 정리합니다. Google 계정 삭제는 Storage API가 실제 파일을 지우고 계정과 연결 데이터를 삭제합니다. Apple 계정은 Face ID/Touch ID 재인증 후 Edge Function이 Apple 토큰을 해제하고 Storage와 Auth 계정을 삭제합니다. 중간에 실패하면 로컬 세션을 제거하지 않아 다시 시도할 수 있습니다.

## Sign in with Apple 설정

코드는 준비되어 있지만 다음 콘솔 설정은 앱 소유자가 직접 완료해야 합니다.

유료 Apple Developer 설정이 끝나기 전에는 `.env.local`의 `EXPO_PUBLIC_APPLE_LOGIN_ENABLED`를 `false`로 유지합니다. `app.config.js`는 이 값으로 `ios.usesAppleSignIn`과 로그인 UI를 함께 제어합니다. EAS `preview`는 `false`, `production`은 `true`로 고정되어 있으며 `eas-build-post-install`이 실제 Xcode entitlement 파일도 동기화해 무료 개발 빌드와 출시 빌드가 섞이지 않습니다. Google 로그인을 제공하는 iOS 앱은 심사 전에 Apple 로그인을 동등하게 제공하거나 iOS의 제3자 소셜 로그인을 제거해야 합니다.

1. Apple Developer에서 앱의 Bundle ID `com.seungmunyou.caferecipes`에 **Sign in with Apple** capability를 켭니다.
2. Apple Developer의 Certificates, Identifiers & Profiles에서 Sign in with Apple용 Services ID와 Key를 만들고 Team ID, Key ID, 내려받은 `.p8` 키를 안전하게 보관합니다. 키는 다시 내려받을 수 없고 저장소에 커밋하면 안 됩니다.
3. Supabase Dashboard → Authentication → Providers → Apple에서 Provider를 활성화하고 Client ID/허용 Client ID, Team ID, Key ID와 secret을 입력합니다. 네이티브 앱 토큰을 허용하도록 Bundle ID도 Client ID 목록에 포함합니다.
4. Authentication → URL Configuration에서 앱 콜백 `caferecipes://auth/callback`을 허용합니다.
5. `ios.usesAppleSignIn`이 네이티브 권한을 바꾸므로 기존 설치 앱에는 JavaScript 새로고침만으로 반영되지 않습니다. `pnpm ios` 또는 EAS Build로 새 iOS 바이너리를 만들어 실기기에 다시 설치합니다.
6. Supabase Edge Functions에 `supabase/functions/delete-account`를 배포하고 Function secrets에 `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`(Bundle ID), `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`(.p8 전문)를 등록합니다. 비밀 값은 `.env`, EAS 환경변수, GitHub에 저장하지 않습니다.
7. 실기기에서 Apple 버튼 → Face ID/Touch ID → 로그인 → `cafe_accounts` 행 생성까지 확인하고, 사진을 올린 뒤 계정 삭제로 Apple 연결·Storage·Auth가 모두 정리되는지 확인합니다.

Apple Developer Program과 App Store 배포에는 Apple의 유료 멤버십이 필요합니다. Supabase Provider의 client secret은 만료 전에 갱신해야 합니다.

## 공개 정책 페이지와 스토어 URL

- 문서 원본: `legal/privacy-policy.md`, `legal/terms-of-service.md`, `legal/community-guidelines.md`, `legal/overseas-transfer.md`
- 앱 표시용 원본: `legal.ts`
- 공개 웹 문서: `docs/` (GitHub Pages에서 main 브랜치의 `/docs` 폴더를 배포)
- 예상 개인정보처리방침 URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/privacy.html`
- 예상 계정 삭제 URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/delete-account.html`
- 예상 지원 URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/support.html`
- 신고·개인정보 문의: `seungmuny1004@gmail.com`
- Supabase 데이터 리전: 미국 동부 버지니아(AWS `us-east-1`)
- 정책 문서는 출시 전 한국 개인정보보호 법률 전문가 검토를 권장합니다.

GitHub에 변경사항을 올린 뒤 Repository Settings → Pages → Deploy from a branch에서 `main`과 `/docs`를 선택합니다. 실제 URL이 열린 뒤 App Store Connect의 Privacy Policy URL과 Google Play Console의 개인정보처리방침·계정 삭제 URL에 입력합니다.

## 신고와 콘텐츠 검토 운영

신규 또는 변경된 온라인 레시피는 `recipe_moderation.pending`으로 저장되고 공개 카탈로그에는 승인된 버전만 노출됩니다. 작성자는 앱에서 검토 중·게시됨·반려됨 상태를 확인합니다. 서버는 외부 링크와 운영 금칙어를 우선 거르고, 운영자는 Supabase Dashboard에서 승인·반려합니다. 신고는 동일 대상의 열린 중복 신고를 막고 계정당 시간당 10회로 제한합니다.

검토 SQL과 처리 기준은 `legal/moderation-operations.md`를 따릅니다. 앱 심사 전에 실제 운영자가 매일 확인 가능한 이메일과 처리 루틴을 유지해야 합니다.

## 검증과 남은 작업

`tests/flow.test.cjs`는 실제 React 화면 컴포넌트의 입력/버튼으로 Cafe 개설, 게시, 저장, 타이머 완료, 맛 기록, 재시작 복원, 뒤로 가기를 검사합니다. 네이티브 저장소는 테스트 대역이므로 실제 기기 저장소/인증 검증을 대체하지 않습니다.

Supabase 인증 설정, Google 공급자 활성화, OAuth 리디렉션, 공개 카탈로그 읽기, 10MB 파일 제한의 사진·영상 저장 형식까지 원격에서 확인했습니다. Xcode 27.0에서 `expo-video`를 포함한 iOS 개발 빌드가 성공했고 iPhone 16 시뮬레이터에서 앱 실행을 확인했습니다. 프로젝트 경로에 한글이 있어 CocoaPods 실행 시에는 영문 임시 빌드 경로가 필요합니다.

출시 전 Google 테스트 모드 해제, Apple Provider·Edge Function secret 활성화, 두 계정 간 RLS, 사진 업로드, 신고·차단, 검토 승인·반려, Apple 토큰 해제, 계정 삭제 후 공개 URL 404를 실제 별도 테스트 계정으로 확인해야 합니다. 신고 검토·처리는 Supabase Dashboard에서 운영자가 수행합니다. 전체 제출 절차는 `release/app-store-connect-checklist.md`, 심사 메모 초안은 `release/app-review-notes.md`를 따릅니다. 공개 댓글과 추천 알고리즘은 포함하지 않았습니다. 맛 기록은 개인 기록입니다. 다중 기기 동시 편집은 마지막 저장 우선이며 충돌 처리는 별도 작업입니다.

타이머는 앱 활성화 시 실제 경과 시간을 반영하며 백그라운드 알림/음성 안내는 포함하지 않습니다. 영상은 선택 단계에서 iOS 호환 중간 품질로 내보내지만, 출시 전 실제 기기에서 위치 메타데이터가 남지 않는지 표본 검사해야 합니다.
