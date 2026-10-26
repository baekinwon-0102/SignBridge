# 백그라운드 인식: 좌표와 시계열 점검

2026-10-26. 현재 Android 소스와 저장소의 Python 학습 전처리를 비교했다.
연결된 Android 기기가 없어 실제 PiP 전후 처리율, 발열, 인식 정확도는 측정하지 못했다.
아래 결과는 코드 경로와 합성 입력 재현 결과다. 실제 수어 정확도 벤치마크가 아니다.

## 비율과 좌표

- MainActivity는 두 PiP 진입 경로 모두 `Rational(3, 4)`를 사용한다. 이 앱의 설정은 16:9가 아니다.
- CameraPipeline은 640×480에 가장 가까운 지원 크기를 카메라에 설정한다.
  PiP 크기를 해상도 선택 또는 크롭에 사용하지 않는다.
- NV21 전체 프레임을 변환하고 회전한 Bitmap으로 손과 자세를 검출한다.
  SignFeatures.extract에 전달하는 폭·높이는 그 Bitmap의 크기다.
- HandCameraView.FrameView는 `min(viewWidth/frameWidth, viewHeight/frameHeight)`로
  같은 배율을 양 축에 적용한다. 여백을 남기며 전체 프레임을 표시하고,
  영상과 관절점 모두 동일한 배율·오프셋·좌우 반전을 적용한다.
- 전면 카메라 좌우 반전은 표시용 Canvas에만 적용된다. 추론은 반전 전 영상이다.
  Python 학습 및 실시간 경로도 원본으로 추론하고 표시만 좌우 반전한다.

따라서 앱 코드에는 PiP 창의 크기 때문에 모델 입력을 찌그러뜨리거나 잘라내는 경로가 없다.
기기 드라이버나 OS 호환 모드의 별도 변환까지 검증한 것은 아니다.

## 회전: 조건부 위험

CameraPipeline은 매 처리 프레임에서 기본 Display 회전을 조회해 Bitmap 회전을 계산한다.
전면은 `(sensor + display) % 360`, 후면은 `(sensor - display + 360) % 360`이다.
PiP 진입 자체가 회전을 반드시 바꾸지는 않지만, 다른 앱이 화면 방향을 바꾸거나
물리 방향과 Display 방향이 달라지면 입력의 정립 상태를 확인해야 한다.

회전값이 바뀌어도 SignSequence를 비우거나 MediaPipe 추적기를 재초기화하는 처리는 없다.
따라서 전환 전후 좌표 기준이 달라지면 한 시퀀스에 섞일 수 있다.
SignFeatures의 어깨 정규화는 위치·크기를 보정하지만 뼈의 x/y 방향을 회전 불변으로 만들지는 않는다.

Camera1의 `setDisplayOrientation` 예제에 있는 mirror 보정은 표시용 Surface 경로다.
이 앱은 raw preview bytes를 직접 회전하고 Canvas에서 반전하므로,
해당 예제의 보정을 그대로 추가해야 한다고 단정할 수 없다.
실제 전면/후면 영상으로 0/90/180/270도별 정립 방향을 확인해야 한다.

참고: [CameraInfo.orientation](https://developer.android.com/reference/android/hardware/Camera.CameraInfo#orientation),
[Camera.setDisplayOrientation](https://developer.android.com/reference/android/hardware/Camera#setDisplayOrientation(int)).

## 시계열: 현재 코드에서 재현됨

CameraPipeline은 프레임 간격 66ms 미만이거나 worker가 처리 중이면 입력을 버린다.
처리율 상한은 약 15fps이며, 실제 처리율이 그보다 낮거나 불규칙할 수 있다.
손이 없거나 자세 검출에 실패한 프레임은 SignSequence.add에 들어가지 않아
모델에 쌓이는 유효 프레임 속도는 PiP에 표시한 처리 FPS보다 더 낮을 수 있다.

SignSequence는 마지막 유효 프레임 30개만 보관한다. timestamp는 손 누락 타임아웃과
추론 호출 간격 500ms 제한에만 쓰이고, 프레임별 timestamp는 저장하지 않는다.
SignTemporalFeatures의 velocity는 인접 특징 차이, acceleration은 그 차이의 차이다.
시간 간격 보정, 시간 윈도우 상한, 시간 기준 리샘플링은 없다.

실제 Java SignSequence/SignTemporalFeatures에 합성 입력을 넣은 결과:

| 입력 간격 | 첫 프레임부터 30번째까지 | 일정한 1 unit/s 특징 변화의 평균 velocity 값 |
| --- | ---: | ---: |
| 67ms (약 15fps) | 1.943초 | 0.067 |
| 100ms (10fps) | 2.900초 | 0.100 |
| 200ms (5fps) | 5.800초 | 0.200 |
| 1,200ms (약 0.83fps) | 34.800초 | 1.200 |

67/67/400ms 간격을 반복하면 일정한 속도의 합성 입력에도 acceleration 최대 0.333이 생긴다.
동일한 특징 30개를 67ms와 200ms 간격으로 넣었을 때 최종 모델 텐서는 완전히 같았다.
즉 모델 입력에는 실제 경과 시간이 전달되지 않는다. 위 수치는 물리 손 속도가 아니라
합성 특징 한 채널의 값이며, 인식률 하락 정도를 뜻하지 않는다.

기존 SignSequenceCheck는 1,200ms 간격에서도 30개를 모으면 추론할 수 있음을 확인한다.
이는 시퀀스 형태·생존성 검사이며, 동작 시간 분포가 학습과 일치하는지는 검사하지 않는다.

## 학습 전처리와 수정 방향

저장소의 `assets/modules/preprocessing.py::process_video`는 영상 전체를 2프레임 간격으로
읽고 `build_temporal_features`에 전달한다. 해당 함수는 전체 길이를 30개로 선형 리샘플링한
다음 velocity/acceleration을 계산한다. 저장된 모델 메타데이터에는 목표 FPS/윈도우 초가 없다.
따라서 '학습 때 정확히 1초 30fps였다'고 볼 근거는 없다.
현재 Python 실시간 코드 역시 길이 30의 rolling buffer를 써서 이 차이를 공유한다.

우선순위:

1. 실기기에서 모드별 처리 FPS, 유효 프레임 FPS, 30프레임의 실제 시간 폭,
   프레임 간격 최대값, Display/센서/적용 회전, 원본/회전 후 영상 크기를 함께 기록한다.
2. 회전 기준이 바뀌면 시퀀스와 추적 상태를 초기화하여 서로 다른 좌표계를 섞지 않는다.
3. 특징과 timestamp를 함께 저장한다. 동작 구간을 정하거나 실측으로 검증한 시간 윈도우를
   사용하고, 그 구간을 시간 기준으로 30개에 리샘플링한 뒤 기존 velocity/acceleration을 계산한다.
4. 긴 공백과 지나치게 적은 관측값은 보간으로 채워 실행하지 않고 입력 부족으로 처리한다.
5. 같은 녹화 동작을 여러 처리율·누락 패턴으로 재생해 클래스/신뢰도 변화를 비교한다.

velocity를 임의로 초당 미분으로 바꾸거나, 근거 없이 1초·30fps로 고정하면 기존 모델의
학습 입력과 달라질 수 있다. 목표 시간 범위는 학습 영상 또는 실제 검증 영상으로 정해야 한다.
이번 점검에서는 앱 인식 로직과 모델을 변경하지 않았다.

## 재현

JDK 17에서 다음 명령으로 production Java 시퀀스 빌더를 실행했다.

```powershell
New-Item -ItemType Directory -Force build/timing-diagnostic | Out-Null
javac -encoding UTF-8 -d build/timing-diagnostic android/app/src/main/java/com/example/testsign/SignSequence.java android/app/src/main/java/com/example/testsign/SignTemporalFeatures.java tools/SignTimingDiagnostic.java
java -cp build/timing-diagnostic com.example.testsign.SignTimingDiagnostic
```
