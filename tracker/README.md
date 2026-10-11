# Tracker 태블릿 실험실

Open Source Physics의 **공식 Tracker Online**을 바탕으로 만든 한국어 태블릿용 웹앱입니다. iPad Safari와 Android 태블릿 Chrome을 대상으로 합니다.

- 실행: https://sion1223.github.io/tracker/
- 코드: https://github.com/sion1223/sion1223.github.io/tree/main/tracker
- 원본: https://github.com/OpenSourcePhysics/tracker-online
- 라이선스: [GPL-3.0](LICENSE)

## 사용 방법

1. **영상·파일 열기**에서 기기/사진 또는 Google Drive 옵션을 선택합니다. 사용 안내의 예제 버튼으로 실제 자유 낙하 영상을 바로 열 수도 있습니다.
2. **① 길이 보정**: 영상 속 길이를 아는 물체의 한쪽 끝과 반대쪽 끝을 차례로 터치하고, 뜨는 입력창에 실제 길이(m/cm/mm)를 입력합니다. 원본 Tracker의 보정 막대(calibration stick)가 만들어지고 축척이 바뀝니다. 아래 ＋/－ 버튼으로 확대하면 더 정확합니다.
3. **② 원점 설정**: 원점으로 쓸 위치를 한 번 터치합니다. **축** 버튼으로 좌표축을 보이거나 숨깁니다.
4. **③ 질점 추가** 후 물체를 프레임마다 터치합니다. 점을 찍으면 다음 프레임으로 넘어가고, 확대 중에는 화면이 마지막 점을 따라갑니다. 잘못 찍은 점은 **점 지우기**로 최근 점부터 지웁니다(보정·원점은 건드리지 않습니다).
5. **④ 결과 분석**: 측정점 표, 위치·속도 그래프, 2차 함수 맞춤으로 구한 가속도(a<sub>x</sub>, a<sub>y</sub>)를 봅니다. **CSV로 저장**하면 결과 목록에 추가됩니다. 위쪽 메뉴의 **영상 / 그래프 / 표**로 원본 Tracker 화면도 볼 수 있습니다.
6. **프로젝트 저장 → 다른 이름으로 저장**으로 영상과 분석을 `.trz`로 묶습니다. **결과 다운로드**에서 파일을 내려받거나 공유합니다.

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

실제 촬영 예제 `docs/examples/BallDrop.mp4`, `BallTossOut.mp4`는 [공식 Tracker 예제 영상 묶음](https://opensourcephysics.github.io/tracker-website/download/mechanics_videos.zip)에서 가져왔습니다(30 fps, H.264, 비월 주사). BallDrop에서 막대의 밝은 칸 10개(1 m)로 보정하고 손을 떠난 뒤 11–17번 프레임을 찍으면 a<sub>y</sub> ≈ −9.9 m/s²가 나옵니다(OpenCV로 따로 구한 기준값 −9.88 m/s²).

합성 예제 `docs/examples/projectile.mp4`는 30 fps 합성 영상입니다. 100 픽셀 = 1 m, x = 0.3 + t m, y = 2.2 − 0.9t² m, 연직 가속도 −1.8 m/s²입니다. 실제 중력가속도 측정 영상이 아닙니다. 재생성: `python scripts/make-demo.py` (Pillow, ffmpeg 필요).

## 변경 사항

- 저장소에 없는 스크립트를 참조하던 모바일 페이지를 현재 배포 엔진에 연결.
- 태블릿용 도구 패널, 한국어 안내, 안전 영역 및 화면 회전 대응.
- 영상·그래프·표 단일 창 전환, 터치 프레임 이동 및 질점 표시.
- 배포 엔진에서 마우스 이동 없이 첫 터치를 할 때 점이 누락되는 문제 수정. 원본 Java 소스의 수정 방식에 맞춰 누르기 시 선택 트랙과 표시 상태를 갱신합니다.
- MP4의 첫 프레임이 준비되기 전 프레임 번호 −1로 크기를 계산하던 엔진 오류 수정. 이 오류로 좌표계 원점이 NaN이 되어 그래프 갱신·프로젝트 복원 시 측정점이 사라졌습니다. 첫 프레임의 배율로 초기 크기를 계산합니다.
- 파일 선택, 프로젝트 결과 다운로드 및 기기의 일반 공유 메뉴 지원.
- 「길이 보정」이 축척을 바꾸지 못하는 읽기 전용 줄자(tape measure)를 만들던 문제 수정. 두 번 터치 + 길이 입력창으로 원본의 보정 막대를 만듭니다.
- 원점 설정(한 번 터치), 축 표시, 확대/축소·맞춤, 확대 중 마지막 점 따라가기 추가.
- 「점 지우기」: Tracker의 실행 취소는 새 점을 기록하지 않아 직전의 보정을 되돌리는 문제가 있어, 찍은 점만 최근 순으로 지웁니다.
- 결과 분석 창(표, 그래프, 2차 함수 맞춤 가속도, R²)과 CSV 저장 추가. 수치는 Tracker 엔진의 데이터를 그대로 사용합니다.
- 빠르게 누른 「다음/이전」이 프레임 탐색 중에 무시되던 문제 수정.
- 시작할 때 나오는 「키보드 연결」 질문을 터치 기기 기본값(아니요)으로 자동 처리.
- 엔진이 만드는 `<video>`에 인라인·미리 불러오기를 설정하고, 영상 열기에 실패하면 멈춘 것처럼 보이지 않도록 오류를 표시. `canplaythrough`가 늦는 브라우저를 위해 `loadeddata` 이후 준비 완료로 처리.
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

Playwright에서 iPad/iPhone WebKit과 Android 태블릿/모바일 Chromium의 뷰포트 및 터치 입력을 검증합니다. `tests/freefall.spec.cjs`는 실제 BallDrop 영상을 터치만으로 보정 → 원점 → 확대 추적 → 점 지우기 → 결과 분석 → CSV 저장까지 진행하고, 측정 가속도가 독립 기준값(−9.88 m/s²)과 0.15 m/s² 이내인지 확인합니다(실행 영상이 `test-results`에 녹화됩니다). 영상 가져오기, 프레임 이동, 실제 좌표 기록, 그래프/표 전환, TRZ 가져오기, 화면 회전, 오류 복구, 파일 선택기 호출, 프로젝트 다운로드·재열기를 검사합니다. WebKit Linux에는 H.264 디코딩용 GStreamer 플러그인이 필요합니다. Windows용 Playwright WebKit은 `blob:` 주소의 영상을 재생하지 못해(HTTP로는 재생됨) 영상 테스트를 건너뛰고, 대신 오류 메시지가 표시되는지 검사합니다. Safari는 blob 영상을 재생합니다. 브라우저 에뮬레이션은 실제 iPad/Android 기기의 사진 보관함·Drive 공급자·공유 메뉴 검증을 대체하지 않습니다.

## 출처와 유지 관리

Tracker: Douglas Brown. OSP: Wolfgang Christian. SwingJS: Robert M. Hanson 및 기여자.

배포 엔진은 `OpenSourcePhysics/tracker-online`의 `e77169f`를 기반으로 합니다. 한국어/기본 Tracker 리소스와 누락 아이콘은 `OpenSourcePhysics/tracker`의 SwingJS 브랜치, controls 리소스는 `OpenSourcePhysics/osp`에서 가져왔습니다. 해당 원본 라이선스와 저작권을 유지합니다. 세부 버전은 `UPSTREAM.md`를 참조하세요.

`docs/desktop.html`은 기존 배포 화면입니다. 태블릿 기능은 `docs/tracker-ios-*.js`, `docs/tracker-files.js`, `docs/css/tracker-ios.css`에 분리했습니다. 파일명의 `ios`는 초기 개발 이름이며 Android에서도 같은 코드를 사용합니다.

현재 웹앱은 기존 Pages 저장소의 `tracker/` 경로에 배포됩니다. `main` 브랜치의 루트를 Pages 원본으로 사용하며, 기존 사이트 파일은 그대로 유지합니다.
