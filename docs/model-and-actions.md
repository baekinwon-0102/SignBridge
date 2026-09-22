# 수어 모델 교체와 명령 실행

`assets/models/sign_model.json`이 Android와 웹의 공통 모델 설정이다.
동일한 입력 규약의 개선된 ONNX 모델은 기존 파일을 교체하고 앱을 다시 빌드하면 된다.
다른 파일명을 사용할 경우 설정의 model 경로와 pubspec.yaml의 assets 등록을 함께 수정한다.
클래스가 달라지면 labels(키 → 0부터 연속 인덱스), dictionary(키 → 한국어)를 함께 교체한다.
클래스 수는 라벨 맵에서 읽으며 112개로 고정하지 않는다.
labelOverrides는 동음이의어를 클래스 ID로 구분한다. 현재 WORD1147(신체 부위)은
`팔 (신체)`로 표시하여 WORD2639(숫자 8)과 구분한다. 교체 모델에 맞춰 이 설정도 확인한다.

- 입력: float32 [1, 30, 150], 기존 SignFeatures / sign_features.mjs의 어깨 정규화 특징.
- 출력: float32 [1, 클래스 수] logits. input/output 텐서명은 JSON에서 변경한다.
- 전처리나 입력 차원이 바뀌는 모델은 모델 파일 교체만으로 호환되지 않는다.
  해당 플랫폼의 추론 어댑터를 수정하되 Flutter의 SignPrediction(text, confidence) 계약을 유지한다.
- 현재 모델에 숫자 1~9나 통화 명령이 없으면 그 명령은 실행되지 않는다.
  제공된 모델에는 숫자 1~9가 있지만 통화 종료 문장은 없다.
  숫자를 임의의 기존 클래스나 손가락 개수로 대신 매핑하지 않는다.
- 명령 라우팅과 반복 실행 방지는 lib/src/sign_commands.dart에 있으며 모델과 독립적이다.
  85% 이상 명령을 한 번 인식하면 확인 창을 열고, 실행을 누르면 1회 실행한다.
  취소·실행 이후 다시 인식하기로 재활성화한다. Android와 웹의 추론 간격은 최소 500ms다.
  최초 30프레임 수집 시간과 기기 처리 지연은 별도로 발생한다.

## 플랫폼 동작

Android: 1/2는 112/119 ACTION_DIAL 발신 화면, 3은 저장된 번호 ACTION_CALL,
4는 com.sampleapp(배달의민족), 5는 입력문을 Google 번역 웹사이트에 전달한다.
6은 등록된 번호와 입력한 본문으로 ACTION_SENDTO 메시지 작성 화면을 연다. 실제 전송은 메시지 앱에서 한다.
7은 분의 십·일의 자리, 초의 십·일의 자리를 숫자 수어로 입력하고 확인하여 시계 앱의 타이머를 시작한다.
현재 모델의 숫자는 1~9이므로 0은 별도 버튼으로 입력한다. 각 자리 입력 전 '다음 숫자 인식'을 눌러
같은 수어가 다음 자리에 중복 입력되지 않게 한다. 초의 십의 자리는 0~5, 전체 시간은 1초~99분 59초다.
ACTION_SET_TIMER와 SET_ALARM 권한을 사용하며 시계 앱에서 시작 결과를 확인한다.
8~9는 기능 미정 안내만 표시한다. 등록 전화번호는 전화·메시지에서 공유하며 앱 내부 SharedPreferences에 저장된다.
설정의 개발자 모드를 켜면 단축키 목록의 번호를 눌러 동일한 확인·실행 경로를 테스트한다.
시간 입력에도 숫자 버튼이 표시된다. 개발자 모드 설정은 앱 실행 중 유지되며 기본값은 꺼짐이다.
통화 종료는 Android 9 이상 TelecomManager.endCall과 ANSWER_PHONE_CALLS 권한을 사용한다.
이 API는 폐기 예정이며 제조사/OS/통화 종류에 따라 거부될 수 있다. 실패를 성공으로 표시하지 않는다.
일반 전화 앱을 대체하는 InCallService/default dialer 역할 구현은 포함하지 않는다.
긴급 통화 종료는 Android가 허용하지 않는다.
플랫폼 근거: [Android TelecomManager](https://developer.android.com/reference/android/telecom/TelecomManager),
[배달의민족 공식 앱](https://play.google.com/store/apps/details?id=com.sampleapp).

웹: 전화 앱 연결 요청(tel:), 메시지 앱 연결 요청(sms:), Google 번역 페이지를 지원한다. 브라우저/기기에 따라
전화·메시지 연결이 제한될 수 있다. 통화 종료·Android 앱 실행·시계 타이머는 지원 불가 안내를 표시한다.
iOS: 기존 카메라 및 네이티브 제어 미지원 상태를 유지한다.
웨어러블 연결 화면은 기존 데모이며 실제 Bluetooth 제어는 구현되어 있지 않다.

## 실기기 검증

자동 테스트는 플랫폼 채널을 대체하며 실제 긴급 발신을 하지 않는다.
실기기에서는 일반 테스트 번호로 권한 허용/거부, 발신, 통화 종료, 배민 설치/미설치,
복귀 후 재인식, 전화번호 저장 후 앱 재시작을 확인한다.
112/119는 실제 발신 없이 발신 화면까지만 확인한다.
설정 → 개발자 모드 → 번역 → 단축키 실행 → 카메라 시작에서 번호를 눌러 테스트한다.
6번은 번호 미등록·메시지 취소·본문 전달과 실제 수신 여부, 7번은 0초 거부·초 범위·취소·
시계 앱 시작과 앱을 떠난 뒤 알림을 확인한다. 자동 테스트는 실제 발신·전송·알림을 증명하지 않는다.

플랫폼 연결 근거: [Android 공통 인텐트](https://developer.android.com/guide/components/intents-common),
[Android 타이머](https://developer.android.com/reference/android/provider/AlarmClock#ACTION_SET_TIMER).
