// 비디오 요소: 웹캠 스트림을 표시할 요소
var video = document.getElementById("video");
// 캔버스 요소: 얼굴 감지 결과를 그릴 요소 (현재는 사용하지 않지만 향후 확장 가능)
var canvas = document.getElementById("canvas");
// 캔버스 2D 컨텍스트: 캔버스에 그리기 위한 객체
var ctx = canvas.getContext("2d");
// 방향 표시 요소: 얼굴 방향을 텍스트로 표시할 요소
var directionDisplay = document.getElementById("direction-display");
// 웹도우 컨테이너: 이미지를 담는 고정된 컨테이너
var webdowContainer = document.getElementById("webdow");
// 웹도우 이미지: 방향에 따라 움직이는 이미지 요소

// content
// var webdowContent = document.getElementById("webdow-image");
// 웹도우 비디오: 방향에 따라 움직이는 비디오 요소
var webdowContent = document.getElementById("webdow-video");

// Face Mesh 객체: MediaPipe Face Mesh 인스턴스
var faceMesh = null;
// Camera 객체: MediaPipe Camera 유틸리티 인스턴스
var camera = null;
// 현재 얼굴 오프셋: 정중앙(0.5, 0.5) 기준으로 얼마나 벗어났는지 저장
// {x: 0.0~1.0, y: 0.0~1.0} 형태, 정중앙은 (0.5, 0.5)
var currentOffset = { x: 0.5, y: 0.5 };

// 이미지 이동 비율: 얼굴 오프셋 1.0당 이미지가 이동할 픽셀 수
var CONTENT_MOVE_SCALE = 200; // 오프셋 1.0당 200px 이동
// X축 이동 보정 계수: 좌우 움직임을 상하 움직임과 비슷하게 만들기 위한 계수
var CONTENT_MOVE_SCALE_X = 1.5; // X축 이동량을 1.5배로 증가 (상하와 비슷하게)

/**
 * - offset 범위: 0.0 ~ 1.0
 * - offsetFromCenter 범위: -0.5 ~ +0.5
 * - 최대 이동 거리 = 0.5 * CONTENT_MOVE_SCALE (양쪽으로 각각)
 * - 필요한 이미지 크기 = 100% + (최대 이동 거리 / webdow 너비) * 100% * 2
 *
 * 예시 (CONTENT_MOVE_SCALE = 200px, webdow 너비 = 1000px):
 * - 최대 이동 거리 = 0.5 * 200 = 100px
 * - 필요한 여유 공간 = 100px * 2 = 200px
 * - 필요한 이미지 크기 = 100% + (200/1000) * 100% = 120%
 *
 * @returns {Number} - webdow 크기 대비 필요한 이미지 크기 비율 (%)
 */
function calculateRequiredContentSize() {
  if (!webdowContainer) return 120; // 기본값

  var webdowWidth = webdowContainer.offsetWidth || window.innerWidth;
  var maxOffsetFromCenter = 0.5; // offset이 0.0 또는 1.0일 때
  var maxMoveDistance = maxOffsetFromCenter * CONTENT_MOVE_SCALE; // 한 방향으로 최대 이동 거리

  // 양쪽으로 이동할 수 있으므로 총 필요한 여유 공간
  var totalExtraSpace = maxMoveDistance * 2;

  // webdow 크기 대비 필요한 추가 크기 비율
  var extraSizePercent = (totalExtraSpace / webdowWidth) * 100;

  // 기본 100% + 추가 크기
  var requiredSize = 100 + extraSizePercent;

  return Math.ceil(requiredSize);
}

// 오프셋 히스토리: 최근 N개 프레임의 오프셋을 저장하여 노이즈 제거
var offsetHistory = [];
var HISTORY_SIZE = 5; // 최근 5개 프레임의 결과를 평균내어 사용

var FACE_LANDMARKS = {
  LEFT_EYE: 33,
  RIGHT_EYE: 263,
  LEFT_MOUTH: 61,
  RIGHT_MOUTH: 291,
  CHIN: 18,
  FOREHEAD: 10,
};

/**
 * @param {Array} landmarks MediaPipe가 반환한 랜드마크 배열 (468개 포인트)
 * @returns {Object} {x: 0.0~1.0, y: 0.0~1.0} 형태의 오프셋, 정중앙은 (0.5, 0.5), 왼쪽으로 갈수록 x가 작아지고, 위로 갈수록 y가 작아짐
 */
function calculateFaceOffset(landmarks) {
  // 랜드마크가 없거나 비어있으면 null 반환
  if (!landmarks || landmarks.length === 0) return null;

  var leftEye = landmarks[FACE_LANDMARKS.LEFT_EYE];
  var rightEye = landmarks[FACE_LANDMARKS.RIGHT_EYE];

  var leftMouth = landmarks[FACE_LANDMARKS.LEFT_MOUTH];
  var rightMouth = landmarks[FACE_LANDMARKS.RIGHT_MOUTH];
  var chin = landmarks[FACE_LANDMARKS.CHIN];
  var forehead = landmarks[FACE_LANDMARKS.FOREHEAD];

  // 눈의 중점
  var eyeCenterX = (leftEye.x + rightEye.x) / 2;
  var eyeCenterY = (leftEye.y + rightEye.y) / 2;

  // 입의 중점
  var mouthCenterX = (leftMouth.x + rightMouth.x) / 2;
  var mouthCenterY = (leftMouth.y + rightMouth.y) / 2;

  // 얼굴의 수직 중심 (이마와 턱의 중점)
  var verticalCenterY = (forehead.y + chin.y) / 2;

  // 얼굴 중심: 눈, 입, 수직 중심의 가중 평균
  // 눈과 입에 더 많은 가중치를 부여 (더 안정적)
  var faceCenterX =
    eyeCenterX * 0.4 +
    mouthCenterX * 0.4 +
    ((leftEye.x + rightEye.x + leftMouth.x + rightMouth.x) / 4) * 0.2;
  var faceCenterY =
    eyeCenterY * 0.3 + mouthCenterY * 0.3 + verticalCenterY * 0.4;

  // 정중앙은 (0.5, 0.5)
  // x: 0.0(왼쪽) ~ 1.0(오른쪽), 정중앙은 0.5
  // y: 0.0(위) ~ 1.0(아래), 정중앙은 0.5
  // 값이 0.0~1.0 범위를 벗어나지 않도록 클램핑
  var offsetX = Math.max(0, Math.min(1, faceCenterX));
  var offsetY = Math.max(0, Math.min(1, faceCenterY));

  return { x: offsetX, y: offsetY };
}

/**
 * @param {Object} offset 현재 프레임에서 계산된 오프셋 {x: 0.0~1.0, y: 0.0~1.0}
 * @returns {Object} 스무딩된 최종 오프셋 {x: 0.0~1.0, y: 0.0~1.0}
 */
function smoothOffset(offset) {
  // 오프셋 히스토리에 추가
  offsetHistory.push(offset);

  // 히스토리 크기가 제한을 넘으면 가장 오래된 항목 제거
  if (offsetHistory.length > HISTORY_SIZE) {
    offsetHistory.shift();
  }

  // 히스토리가 충분히 쌓이지 않았으면 현재 오프셋 반환
  if (offsetHistory.length < 2) {
    return offset;
  }

  // 히스토리의 평균값 계산
  var sumX = 0;
  var sumY = 0;
  for (var i = 0; i < offsetHistory.length; i++) {
    sumX += offsetHistory[i].x;
    sumY += offsetHistory[i].y;
  }

  var smoothedX = sumX / offsetHistory.length;
  var smoothedY = sumY / offsetHistory.length;

  return { x: smoothedX, y: smoothedY };
}

/**
 * @param {Object} offset - 얼굴 오프셋 {x: 0.0~1.0, y: 0.0~1.0}
 *                         정중앙은 (0.5, 0.5)
 *
 * 이미지 이동 로직:
 * - 정중앙(0.5, 0.5) 기준으로 얼마나 벗어났는지 계산
 * - 오프셋에 비례하여 이미지 위치 변경 (방향 반대로)
 * - 얼굴이 왼쪽으로 가면 이미지도 왼쪽으로 이동
 * - 얼굴이 위로 가면 이미지도 위로 이동
 */
function updateContentPositionFromOffset(offset) {
  // 이미지 요소가 없으면 함수 종료
  if (!webdowContent) return;

  // 정중앙(0.5, 0.5) 기준으로 오프셋 계산
  // -0.5 ~ +0.5 범위로 변환
  var offsetFromCenterX = offset.x - 0.5;
  var offsetFromCenterY = offset.y - 0.5;

  // 오프셋을 픽셀 단위로 변환 (방향 반대로)
  // 얼굴이 왼쪽으로 가면 이미지도 왼쪽으로 가야 하므로 부호 반전
  // 얼굴이 위로 가면 이미지도 위로 가야 하므로 부호 반전
  // X축 이동량에 보정 계수를 적용하여 좌우 움직임을 상하와 비슷하게 조정
  var translateX =
    -offsetFromCenterX * CONTENT_MOVE_SCALE * CONTENT_MOVE_SCALE_X;
  var translateY = -offsetFromCenterY * CONTENT_MOVE_SCALE;

  // transform 속성 업데이트
  // translate(-50%, -50%)는 중앙 정렬을 위한 기본값
  // 추가로 translate(translateX, translateY)를 적용하여 오프셋에 따라 이동
  webdowContent.style.transform =
    "translate(-50%, -50%) translate(" +
    translateX +
    "px, " +
    translateY +
    "px)";
}

/**
 * @param {Object} offset - 얼굴 오프셋 {x: 0.0~1.0, y: 0.0~1.0}
 * @param {Boolean} forceUpdate - true일 경우 강제로 업데이트 (얼굴 미감지 시 중앙으로 리셋할 때 사용)
 */
function displayOffset(offset, forceUpdate) {
  if (!offset) return;

  // 스무딩을 적용하여 노이즈 제거
  var smoothedOffset = smoothOffset(offset);

  // 오프셋이 크게 변경되지 않았으면 업데이트하지 않음 (성능 최적화)
  // 단, forceUpdate가 true이면 항상 업데이트
  if (!forceUpdate) {
    var deltaX = Math.abs(smoothedOffset.x - currentOffset.x);
    var deltaY = Math.abs(smoothedOffset.y - currentOffset.y);
    // 변화가 매우 작으면 (0.01 이하) 업데이트하지 않음
    if (deltaX < 0.01 && deltaY < 0.01) {
      return;
    }
  }

  currentOffset = smoothedOffset;

  // 방향 표시 요소가 있으면 텍스트 업데이트
  if (directionDisplay) {
    var offsetX = ((smoothedOffset.x - 0.5) * 100).toFixed(1);
    var offsetY = ((smoothedOffset.y - 0.5) * 100).toFixed(1);
    directionDisplay.textContent =
      "오프셋: X=" + offsetX + "%, Y=" + offsetY + "%";
  }

  // 이미지 위치 업데이트
  updateContentPositionFromOffset(smoothedOffset);

  // 콘솔에도 출력 (디버깅용)
  console.log(
    "얼굴 오프셋: X=" +
      smoothedOffset.x.toFixed(3) +
      ", Y=" +
      smoothedOffset.y.toFixed(3)
  );
}

function initializeFaceMesh() {
  // Face Mesh 객체 생성
  faceMesh = new FaceMesh({
    // 모델 파일 경로 지정 함수
    // MediaPipe는 내부적으로 .wasm, .data 등의 파일이 필요
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
    },
  });

  // 얼굴 감지 옵션 설정 (인식률 개선을 위해 조정)
  faceMesh.setOptions({
    maxNumFaces: 1, // 최대 1개의 얼굴만 감지
    refineLandmarks: true, // 랜드마크 정밀도 향상 (더 정확한 감지)
    // 신뢰도 임계값을 낮춰서 더 민감하게 감지 (0.3 = 30% 이상이면 감지)
    // 낮은 값일수록 더 많은 프레임에서 얼굴을 감지하지만, 노이즈도 증가할 수 있음
    // 스무딩 기능으로 노이즈는 필터링됨
    minDetectionConfidence: 0.3, // 얼굴 감지 최소 신뢰도 30% (기존 50%에서 낮춤)
    minTrackingConfidence: 0.3, // 얼굴 추적 최소 신뢰도 30% (기존 50%에서 낮춤)
  });

  // 얼굴 감지 결과를 처리할 콜백 함수 등록
  // 얼굴이 감지될 때마다 이 함수가 호출
  faceMesh.onResults(onFaceMeshResults);
}

/**
 * @param {Object} results - MediaPipe가 반환한 감지 결과
 *   - results.image: 원본 비디오 프레임
 *   - results.multiFaceLandmarks: 감지된 얼굴들의 랜드마크 배열
 */
function onFaceMeshResults(results) {
  // 캔버스에 그리기 시작
  ctx.save();
  // 이전 프레임 지우기
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 원본 비디오 프레임 그리기
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  // multiFaceLandmarks가 있고, 배열에 얼굴이 하나 이상 있으면
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    // 첫 번째 얼굴의 랜드마크 가져오기 (maxNumFaces=1이므로 항상 첫 번째만)
    var landmarks = results.multiFaceLandmarks[0];

    // 얼굴 메시 그리기 (MediaPipe drawing_utils 사용)
    if (
      typeof drawConnectors !== "undefined" &&
      typeof drawLandmarks !== "undefined"
    ) {
      // 얼굴 윤곽선 그리기
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
        color: "#C0C0C070",
        lineWidth: 1,
      });
      // 얼굴 랜드마크 점 그리기
      drawLandmarks(ctx, landmarks, {
        color: "#FF3030",
        lineWidth: 1,
        radius: 1,
      });
    }

    // 얼굴 오프셋 계산
    var offset = calculateFaceOffset(landmarks);

    // 오프셋이 계산되었으면 화면에 표시하고 이미지 위치 업데이트
    if (offset) {
      displayOffset(offset, false);
    }
  } else {
    // 얼굴이 감지되지 않으면 중앙(0.5, 0.5)으로 리셋
    // 히스토리도 초기화하여 다음 감지 시 깨끗한 상태에서 시작
    offsetHistory = [];
    displayOffset({ x: 0.5, y: 0.5 }, true);
  }

  // 캔버스 그리기 종료
  ctx.restore();
}

/**
 * MediaPipe Camera 유틸리티는:
 * - 웹캠 스트림을 자동으로 관리
 * - 매 프레임마다 onFrame 콜백 호출
 * - 비디오 요소에 자동으로 스트림 연결
 */
function initializeCamera() {
  // Camera 객체 생성
  // MediaPipe의 Camera 유틸리티를 사용하여 웹캠을 쉽게 제어할 수 있음
  camera = new Camera(video, {
    // 매 프레임마다 호출되는 콜백 함수
    // 이 함수에서 Face Mesh에 현재 프레임을 전달하여 얼굴을 감지
    onFrame: async () => {
      // Face Mesh에 현재 비디오 프레임 전달
      // send()는 비동기 함수이므로 await 사용
      await faceMesh.send({ image: video });
    },
    width: 640, // 비디오 너비 (픽셀)
    height: 480, // 비디오 높이 (픽셀)
  });

  // 카메라 시작
  // 이 함수가 호출되면:
  // 1. 사용자에게 웹캠 권한 요청
  // 2. 웹캠 스트림을 비디오 요소에 연결
  // 3. 매 프레임마다 onFrame 콜백 호출 시작
  camera.start();
}

function init() {
  canvas.width = 320;
  canvas.height = 240;

  var webdowVideo = document.getElementById("webdow-video");
  if (webdowVideo) {
    var currentOrigin =
      window.location.origin ||
      window.location.protocol + "//" + window.location.host;

    // YouTube URL에 origin 파라미터 추가
    var videoUrl = webdowVideo.src;
    if (videoUrl.indexOf("origin=") === -1) {
      var separator = videoUrl.indexOf("?") === -1 ? "?" : "&";
      webdowVideo.src =
        videoUrl + separator + "origin=" + encodeURIComponent(currentOrigin);
    }
  }

  var requiredSize = calculateRequiredContentSize();
  if (webdowContent) {
    webdowContent.style.width = requiredSize + "%";
    webdowContent.style.height = requiredSize + "%";
    console.log("계산된 이미지 크기: " + requiredSize + "%");
    console.log("현재 설정: CONTENT_MOVE_SCALE=" + CONTENT_MOVE_SCALE + "px");
    console.log("최대 이동 거리: ±" + 0.5 * CONTENT_MOVE_SCALE + "px");
  }

  displayOffset({ x: 0.5, y: 0.5 }, true);

  initializeFaceMesh();

  initializeCamera();
}

if (document.readyState === "loading") {
  // DOM이 아직 로딩 중이면 로드 완료 이벤트 대기
  document.addEventListener("DOMContentLoaded", init);
} else {
  // DOM이 이미 로드되었으면 즉시 실행
  init();
}
