# RATIO App Store Connect 제출 체크리스트

## 메타데이터 URL

- Support URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/support.html`
- Privacy Policy URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/privacy.html`
- 계정 삭제 안내: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/delete-account.html`
- 이용약관: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/terms.html`
- 문의 이메일: `seungmuny1004@gmail.com`

GitHub Pages에 최신 `docs/`가 반영된 뒤 로그아웃 상태의 브라우저에서 모든 URL을 열어 확인한다.

## 빌드 전 필수 확인

- `20260921_private_media_hardening.sql` 적용 후 `recipe-images`와 `recipe-media-private` 두 버킷이 모두 Private인지 확인한다. 이 변경 후 기존 테스트 앱은 이미지 URL을 직접 열 수 없으므로 최신 앱으로 업데이트한다.
- 출시 프로필에서 로컬 프로필, 공식 시드 버튼, 영상 업로드가 보이지 않는지 확인한다.
- Apple Developer에서 `com.seungmunyou.caferecipes`의 Sign in with Apple capability를 활성화한다.
- Supabase Authentication → Providers에서 Apple을 활성화하고 Bundle ID를 허용한다.
- `delete-account` Edge Function을 배포하고 `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`를 Supabase secret으로 등록한다.
- Google OAuth 동의 화면을 Testing에서 Production으로 전환하고, 심사용 계정이 테스트 사용자에만 묶이지 않는지 확인한다.
- EAS `production` 프로필로 빌드하여 `EXPO_PUBLIC_APPLE_LOGIN_ENABLED=true`와 Apple entitlement를 함께 적용한다.
- iPhone 실기기에서 Apple·Google 로그인을 각각 확인한다.

## 계정 삭제 실기기 검증

1. Google 테스트 계정으로 레시피와 사진을 올린 뒤 승인 전 다른 계정 및 로그아웃 브라우저에서 사진이 열리지 않는지 확인한다.
2. `내 Cafe → 설정 → 온라인 계정 삭제`를 실행한다.
3. Supabase Authentication에서 사용자가 사라지고 Storage의 UID 폴더가 빈 것을 확인한다.
4. 기존 공개 이미지 URL이 400/401/404 중 하나로 접근 거부되는지 확인한다.
5. Apple 테스트 계정에서 같은 과정을 반복하고 Face ID 재인증 후 삭제되는지 확인한다.
6. Apple ID 설정의 `Apple로 로그인`에서 RATIO 연결이 해제됐는지 확인한다.

## UGC 심사 검증

- 레시피 상세에서 신고하고 `reports`에 행이 생성되는지 확인한다.
- 다른 일반 계정으로 `reports` 조회가 거부되는지 확인한다.
- Cafe를 차단하면 홈·탐색 피드에서 해당 콘텐츠가 즉시 사라지는지 확인한다.
- 운영자가 Supabase에서 신고를 매일 확인하고 처리할 수 있는 루틴을 유지한다.
- 계정 A의 JWT로 계정 B의 `cafe_accounts`, 미승인 Storage 파일, 차단 목록과 신고 내역을 조회할 수 없는지 확인한다.
- 레시피 승인 후에만 계정 B와 로그아웃 이용자에게 제한 시간 이미지 주소가 발급되는지 확인한다.

## App Privacy와 추적

- 현재 앱에는 AdMob, 광고 SDK, 제3자 행태 추적 SDK가 없다.
- ATT 프롬프트나 `NSUserTrackingUsageDescription`을 추가하지 않는다.
- App Store Connect App Privacy에는 이메일, 사용자 ID, 사용자 콘텐츠, 사진, 진단 정보의 실제 처리와 목적을 현재 빌드 기준으로 정확히 선택한다. 영상 업로드를 다시 켤 때 영상 항목도 추가한다.
- 추후 광고나 분석 SDK를 추가하면 코드·개인정보처리방침·App Privacy·ATT 필요 여부를 모두 재검토한다.

## 제출 직전

- 앱 크래시 없이 첫 실행되는지 테스트한다.
- 심사용 계정은 실제 로그인 가능하고 2FA 또는 일회용 코드에 막히지 않게 준비한다. 자격 증명은 App Store Connect의 안전한 필드에만 입력하고 GitHub에 커밋하지 않는다.
- 심사 메모에 신고·차단·계정 삭제·문의 경로를 적는다.
- TestFlight의 외부 테스트를 거쳐 실기기 동작을 확인한다.
