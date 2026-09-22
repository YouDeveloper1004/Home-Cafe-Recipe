# App Review Notes 초안

Bean Chillin는 사용자가 Cafe를 만들고 커피 레시피를 게시·구독·실행할 수 있는 UGC 앱입니다. 광고, AdMob, 인앱결제, 구독 상품, 제3자 광고 추적을 사용하지 않습니다. ATT 권한을 요청하지 않습니다.

## 주요 심사 경로

- Apple 로그인: `내 Cafe → Apple로 계속하기`
- Google 로그인: `내 Cafe → Google로 계속하기`
- Cafe 신고·차단: 다른 사용자의 Cafe 프로필 → `Cafe 신고하기` / `Cafe 차단하기`
- 레시피 신고: 다른 사용자의 레시피 상세 → `신고`
- 계정 삭제: `내 Cafe → 설정 → 온라인 계정 삭제`
- 약관·개인정보: `내 Cafe → 설정`
- 도움말·문의: `내 Cafe → 설정 → 도움말·문의 페이지`

Apple로 가입한 사용자가 계정을 삭제하면 시스템 재인증을 거친 뒤 Apple 토큰을 해제하고, Storage의 사진과 계정 데이터를 삭제합니다. 전체 과정이 성공한 뒤에만 로컬 세션을 제거합니다. 새 사진은 승인 전 비공개로 보관되고 승인된 레시피에만 제한 시간 접근 주소가 발급됩니다. 영상 업로드는 현재 출시 빌드에서 비활성화되어 있습니다.

## 심사 계정

App Store Connect의 Sign-in information 필드에 심사용 Google 계정을 별도로 입력합니다. 자격 증명은 이 문서나 공개 GitHub에 기록하지 않습니다.

## 지원

- Support URL: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/support.html`
- Privacy Policy: `https://youdeveloper1004.github.io/Home-Cafe-Recipe/privacy.html`
- 이메일: `seungmuny1004@gmail.com`
