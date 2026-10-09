# Tracker 태블릿 실험실

Open Source Physics의 **공식 Tracker Online**을 바탕으로 만든 한국어 태블릿용 웹앱입니다. iPad Safari와 Android 태블릿 Chrome을 대상으로 합니다.

- 실행: https://sion1223.github.io/tracker/
- 코드: https://github.com/sion1223/sion1223.github.io/tree/main/tracker
- 원본: https://github.com/OpenSourcePhysics/tracker-online
- 라이선스: [GPL-3.0](LICENSE)

## 사용 방법

1. **영상·파일 열기**에서 기기/사진 또는 Google Drive 옵션을 선택합니다.
2. **길이 보정**으로 길이를 아는 물체에 보정 막대를 맞추고 실제 길이를 입력합니다. 좌표계의 원점과 방향도 맞춥니다.
3. **질점 추가** 후 **터치로 점 찍기**를 켜고 물체 위치를 프레임마다 터치합니다. 이전/다음 버튼으로 프레임을 이동할 수 있습니다.
4. 위쪽 메뉴에서 **영상 / 그래프 / 표**를 전환합니다. 위치, 속도, 가속도 계산은 원본 Tracker 엔진이 수행합니다.
5. **프로젝트 저장 → 다른 이름으로 저장**으로 영상과 분석을 `.trz`로 묶습니다. **결과 다운로드**에서 파일을 내려받습니다. Tracker의 데이터 내보내기 기능에서 만든 표 데이터도 이 목록에서 받을 수 있습니다.

프로젝트 저장 후 파일을 다시 열면 영상과 분석을 함께 복원할 수 있습니다. `.trk` 단독 파일이 외부 영상을 참조한다면 원본 영상을 별도로 다시 선택해야 할 수 있습니다.

### Google Drive 파일 선택

Google 로그인 SDK, OAuth, Drive API 및 자동 업로드는 사용하지 않습니다. 파일을 가져올 때 **운영체제의 파일 선택기**에서 Google Drive를 선택하는 방식입니다.

- iPad: Drive 앱 설치·로그인 → 파일 앱 → 둘러보기 → 편집에서 Google Drive 활성화.
- Android: Drive 앱 설치·로그인 → 파일 선택기 왼쪽 메뉴에서 Drive 선택.
- 선택기에 Drive가 없으면 Drive 앱에서 먼저 파일을 기기에 내려받아 선택합니다.

### 홈 화면에 추가

- iPad Safari: 공유 → 홈 화면에 추가.
- Android Chrome: 메뉴 → 홈 화면에 추가.

앱 설치와 별개로 최초 실행 및 추가 기능 로딩에 인터넷이 필요합니다. 자동 저장 및 완전한 오프라인 실행은 지원하지 않습니다. 최근 결과 3개와 마지막 원본은 현재 탭의 메모리에만 보관됩니다. 탭을 닫거나 다른 앱으로 이동하기 전에 결과를 다운로드하세요.

### 권장 영상

H.264 / yuv420p / MP4의 짧은 고정 프레임률 영상을 권장합니다. 파일당 최대 200 MB입니다. 기기와 브라우저가 지원하지 않는 코덱은 변환이 필요합니다. iPad 카메라에서는 ‘높은 호환성’을 선택하세요. 슬로 모션 및 가변 프레임률 영상의 시간 간격은 실험 조건과 일치하는지 확인하세요.

기본 예제 `docs/examples/projectile.mp4`는 30 fps 합성 영상입니다. 100 픽셀 = 1 m, x = 0.3 + t m, y = 2.2 − 0.9t² m, 연직 가속도 −1.8 m/s²입니다. 실제 중력가속도 측정 영상이 아닙니다. 재생성: `python scripts/make-demo.py` (Pillow, ffmpeg 필요).

## 변경 사항

- 저장소에 없는 스크립트를 참조하던 모바일 페이지를 현재 배포 엔진에 연결.
- 태블릿용 도구 패널, 한국어 안내, 안전 영역 및 화면 회전 대응.
- 영상·그래프·표 단일 창 전환, 터치 프레임 이동 및 질점 표시.
- 배포 엔진에서 마우스 이동 없이 첫 터치를 할 때 점이 누락되는 문제 수정. 원본 Java 소스의 수정 방식에 맞춰 누르기 시 선택 트랙과 표시 상태를 갱신합니다.
- MP4의 첫 프레임이 준비되기 전 프레임 번호 −1로 크기를 계산하던 엔진 오류 수정. 이 오류로 좌표계 원점이 NaN이 되어 그래프 갱신·프로젝트 복원 시 측정점이 사라졌습니다. 첫 프레임의 배율로 초기 크기를 계산합니다.
- 파일 선택, 프로젝트 결과 다운로드 및 기기의 일반 공유 메뉴 지원.
- 원본 `tracker_ko.properties`를 기본으로 적용하고, 새 기능의 누락 번역 83개 및 작업 창 설명 1개 보완. 한국어 실행에 필요한 누락 OSP controls 리소스 추가.

## 개발 및 검증

```sh
cd tracker
npm ci
npx playwright install --with-deps chromium webkit
npm start
```

http://localhost:8000/ 에서 실행합니다. 정적 파일만 사용하므로 별도의 백엔드·계정·API 키가 필요하지 않습니다. `file://`로 직접 HTML을 열지 마세요.

```sh
npm test
```

Playwright에서 iPad/iPhone WebKit과 Android 태블릿/모바일 Chromium의 뷰포트 및 터치 입력을 검증합니다. 영상 가져오기, 프레임 이동, 실제 좌표 기록, 그래프/표 전환, TRZ 가져오기, 화면 회전, 오류 복구, 파일 선택기 호출, 프로젝트 다운로드·재열기를 검사합니다. WebKit Linux에는 H.264 디코딩용 GStreamer 플러그인이 필요합니다. 브라우저 에뮬레이션은 실제 iPad/Android 기기의 사진 보관함·Drive 공급자·공유 메뉴 검증을 대체하지 않습니다.

## 출처와 유지 관리

Tracker: Douglas Brown. OSP: Wolfgang Christian. SwingJS: Robert M. Hanson 및 기여자.

배포 엔진은 `OpenSourcePhysics/tracker-online`의 `e77169f`를 기반으로 합니다. 한국어/기본 Tracker 리소스와 누락 아이콘은 `OpenSourcePhysics/tracker`의 SwingJS 브랜치, controls 리소스는 `OpenSourcePhysics/osp`에서 가져왔습니다. 해당 원본 라이선스와 저작권을 유지합니다. 세부 버전은 `UPSTREAM.md`를 참조하세요.

`docs/desktop.html`은 기존 배포 화면입니다. 태블릿 기능은 `docs/tracker-ios-*.js`, `docs/tracker-files.js`, `docs/css/tracker-ios.css`에 분리했습니다. 파일명의 `ios`는 초기 개발 이름이며 Android에서도 같은 코드를 사용합니다.

현재 웹앱은 기존 Pages 저장소의 `tracker/` 경로에 배포됩니다. `main` 브랜치의 루트를 Pages 원본으로 사용하며, 기존 사이트 파일은 그대로 유지합니다.
