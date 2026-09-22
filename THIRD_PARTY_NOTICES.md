# RATIO 제3자 소프트웨어 고지

RATIO는 아래 오픈소스 소프트웨어를 사용합니다. 각 저작권과 라이선스는 해당 프로젝트에 귀속됩니다. 이 목록은 앱의 직접 런타임 의존성을 기준으로 작성했으며, 배포 전 잠금 파일 변경 시 다시 검토합니다.

| 프로젝트 | 용도 | 라이선스 |
| --- | --- | --- |
| Expo 및 Expo SDK 모듈 | React Native 앱 런타임·기기 기능 | MIT |
| React / React Native | 사용자 인터페이스 런타임 | MIT |
| Supabase JavaScript | 인증·데이터베이스·Storage 클라이언트 | MIT |
| Async Storage | 로컬 테스트 프로필 저장 | MIT |
| React Native Safe Area Context | 안전 영역 레이아웃 | MIT |

전체 전이 의존성과 정확한 버전은 `pnpm-lock.yaml`에 고정되어 있습니다. 배포물에 포함되는 라이선스 전문은 각 패키지의 `LICENSE` 파일을 따릅니다. RATIO 자체 소스의 조건은 저장소 루트의 `LICENSE`를 따릅니다.

전이 의존성 검사에서 MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0, MPL-2.0, Python-2.0, Unlicense 및 복수 라이선스 패키지를 확인했습니다. `node-forge`는 선택 가능한 BSD-3-Clause 조건을 따릅니다. `caniuse-lite`의 브라우저 호환성 데이터는 CC-BY-4.0이며 원 프로젝트는 [browserslist/caniuse-lite](https://github.com/browserslist/caniuse-lite)입니다. 이 데이터는 Expo 빌드 도구의 전이 의존성으로 사용됩니다.

앱 아이콘, UI 그래픽, 샘플 및 초기 레시피 사진은 RATIO 프로젝트를 위해 새로 생성하고 사람이 선택·편집한 자산이며, 제3자 웹사이트의 이미지를 복사하지 않았습니다. 자세한 기록은 `docs/asset-provenance.md`에 있습니다.
