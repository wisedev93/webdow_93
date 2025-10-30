// 설정
const CENTER_SIZE = 300;
document.getElementById("centerSizeLabel").textContent = CENTER_SIZE;

// DOM
const fileInput = document.getElementById("file");
const processBtn = document.getElementById("processBtn");
const downloadCenterBtn = document.getElementById("downloadCenterBtn");
const downloadTopBtn = document.getElementById("downloadTopBtn");
const downloadBottomBtn = document.getElementById("downloadBottomBtn");
const downloadLeftBtn = document.getElementById("downloadLeftBtn");
const downloadRightBtn = document.getElementById("downloadRightBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");

const srcCanvas = document.getElementById("srcCanvas");
const centerCanvas = document.getElementById("centerCanvas");
const topCanvas = document.getElementById("topCanvas");
const bottomCanvas = document.getElementById("bottomCanvas");
const leftCanvas = document.getElementById("leftCanvas");
const rightCanvas = document.getElementById("rightCanvas");

const srcCtx = srcCanvas.getContext("2d");

let loadedImage = null;
let squareSize = CENTER_SIZE; // 실제 내부 처리에 사용되는 정사각 사이즈
let processed = false; // 처리 완료 여부

// 이미지 로드 및 캔버스 맞춤
function drawImageToSquare(img) {
  // 작은 이미지는 600 정사각 업스케일, 큰 이미지는 원본 크기 유지
  const maxSide = Math.max(img.width, img.height);
  const isSmall = maxSide < 300;

  if (isSmall) {
    const size = 600;
    squareSize = size;
    srcCanvas.width = srcCanvas.height = size;
    srcCtx.fillStyle = "#000";
    srcCtx.fillRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    srcCtx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
  } else {
    squareSize = maxSide;
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    srcCtx.drawImage(img, 0, 0);
  }
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadImg(url);
});

function loadImg(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    loadedImage = img;
    drawImageToSquare(img);
    processBtn.disabled = false;
    processed = false;
    setDownloadButtonsEnabled(false);
  };
  img.onerror = (err) => {
    alert(
      "이미지 로드 실패, CORS 문제일 수 있습니다. 로컬 파일을 업로드해 주세요."
    );
    console.error(err);
  };
  img.src = src;
}

// OpenCV.js가 준비되면 onRuntimeInitialized가 호출됩니다.
function onOpenCvReady() {
  console.log("OpenCV.js ready");
}

// 전역으로 cv가 준비될 때 콜백 설정
if (typeof cv !== "undefined") {
  if (cv.getBuildInformation) {
    // 이미 로드되어 있는 경우
    console.log("cv already loaded");
    onOpenCvReady();
  } else {
    // 로드 중인 경우
    cv["onRuntimeInitialized"] = onOpenCvReady;
  }
} else {
  // 스크립트가 비동기 로드될 경우 onRuntimeInitialized 설정
  document.addEventListener("opencvready", onOpenCvReady);
}

// 사다리꼴 좌표 계산 (가로/세로 입력 지원)
function computeQuads(width, height) {
  const n = CENTER_SIZE;
  const cx1 = (width - n) / 2;
  const cx2 = (width + n) / 2;
  const cy1 = (height - n) / 2;
  const cy2 = (height + n) / 2;

  const TL = [0, 0],
    TR = [width, 0],
    BR = [width, height],
    BL = [0, height];
  const center = [
    [cx1, cy1],
    [cx2, cy1],
    [cx2, cy2],
    [cx1, cy2],
  ];

  const top = [TL, TR, center[1], center[0]];
  const bottom = [center[3], center[2], BR, BL];
  const left = [TL, center[0], center[3], BL];
  const right = [center[1], TR, BR, center[2]];

  return { center, top, bottom, left, right };
}

// OpenCV: quad -> square warp
function warpQuadToSquare(srcMat, quad, outSize = CENTER_SIZE) {
  // quad: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]  (순서: TL, TR, BR, BL)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0][0],
    quad[0][1],
    quad[1][0],
    quad[1][1],
    quad[2][0],
    quad[2][1],
    quad[3][0],
    quad[3][1],
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outSize,
    0,
    outSize,
    outSize,
    0,
    outSize,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  const dsize = new cv.Size(outSize, outSize);
  cv.warpPerspective(
    srcMat,
    dst,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  srcTri.delete();
  dstTri.delete();
  M.delete();
  return dst;
}

// 일반 직사각 출력 지원
function warpQuadToRect(srcMat, quad, outWidth, outHeight) {
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0][0],
    quad[0][1],
    quad[1][0],
    quad[1][1],
    quad[2][0],
    quad[2][1],
    quad[3][0],
    quad[3][1],
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outWidth,
    0,
    outWidth,
    outHeight,
    0,
    outHeight,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  const dsize = new cv.Size(outWidth, outHeight);
  cv.warpPerspective(
    srcMat,
    dst,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );
  srcTri.delete();
  dstTri.delete();
  M.delete();
  return dst;
}

// cv.Mat -> canvas에 출력
function imshowMat(mat, canvas) {
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  try {
    cv.imshow(canvas, mat);
  } catch (e) {
    console.error("cv.imshow 실패", e);
  }
}

function setDownloadButtonsEnabled(enabled) {
  const buttons = [
    downloadCenterBtn,
    downloadTopBtn,
    downloadBottomBtn,
    downloadLeftBtn,
    downloadRightBtn,
    downloadAllBtn,
  ];
  buttons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = !enabled;
  });
}

function downloadCanvas(canvas, filename) {
  if (!processed) {
    alert("먼저 '처리 실행'을 완료해 주세요.");
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

processBtn.addEventListener("click", () => {
  if (!loadedImage) {
    alert("이미지를 먼저 업로드하세요.");
    return;
  }
  if (!cv || !cv.Mat) {
    alert("OpenCV.js가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.");
    return;
  }

  // 원본 캔버스에서 srcMat 생성
  const srcMat = cv.imread(srcCanvas);
  const width = srcMat.cols;
  const height = srcMat.rows;
  const isSmall = Math.max(width, height) < 300;

  const quads = computeQuads(width, height);

  let centerMat, topMat, bottomMat, leftMat, rightMat;
  if (isSmall) {
    // 기존 동작: 모두 300x300
    centerMat = warpQuadToSquare(srcMat, quads.center, CENTER_SIZE);
    topMat = warpQuadToSquare(srcMat, quads.top, CENTER_SIZE);
    bottomMat = warpQuadToSquare(srcMat, quads.bottom, CENTER_SIZE);
    leftMat = warpQuadToSquare(srcMat, quads.left, CENTER_SIZE);
    rightMat = warpQuadToSquare(srcMat, quads.right, CENTER_SIZE);
  } else {
    // 큰 이미지: 요구 크기 적용
    const lrWidth = Math.max(1, width - CENTER_SIZE);
    const lrHeight = CENTER_SIZE; // 좌/우: height 300
    const tbWidth = CENTER_SIZE; // 상/하: width 300
    const tbHeight = Math.max(1, height - CENTER_SIZE);

    centerMat = warpQuadToSquare(srcMat, quads.center, CENTER_SIZE);
    topMat = warpQuadToRect(srcMat, quads.top, tbWidth, tbHeight);
    bottomMat = warpQuadToRect(srcMat, quads.bottom, tbWidth, tbHeight);
    leftMat = warpQuadToRect(srcMat, quads.left, lrWidth, lrHeight);
    rightMat = warpQuadToRect(srcMat, quads.right, lrWidth, lrHeight);
  }

  // 출력
  imshowMat(centerMat, centerCanvas);
  imshowMat(topMat, topCanvas);
  imshowMat(bottomMat, bottomCanvas);
  imshowMat(leftMat, leftCanvas);
  imshowMat(rightMat, rightCanvas);

  // 메모리 해제
  srcMat.delete();
  centerMat.delete();
  topMat.delete();
  bottomMat.delete();
  leftMat.delete();
  rightMat.delete();

  console.log("처리 완료");
  processed = true;
  setDownloadButtonsEnabled(true);
});

// 페이지에 이미지 드래그 앤 드롭도 지원 (선택)
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    const url = URL.createObjectURL(e.dataTransfer.files[0]);
    loadImg(url);
  }
});

// 초기 안내 텍스트 대신 기본 상태

// 다운로드 버튼 이벤트
downloadCenterBtn.addEventListener("click", () =>
  downloadCanvas(centerCanvas, "center.png")
);
downloadTopBtn.addEventListener("click", () =>
  downloadCanvas(topCanvas, "top.png")
);
downloadBottomBtn.addEventListener("click", () =>
  downloadCanvas(bottomCanvas, "bottom.png")
);
downloadLeftBtn.addEventListener("click", () =>
  downloadCanvas(leftCanvas, "left.png")
);
downloadRightBtn.addEventListener("click", () =>
  downloadCanvas(rightCanvas, "right.png")
);
downloadAllBtn.addEventListener("click", () => {
  [
    { c: centerCanvas, name: "center.png" },
    { c: topCanvas, name: "top.png" },
    { c: bottomCanvas, name: "bottom.png" },
    { c: leftCanvas, name: "left.png" },
    { c: rightCanvas, name: "right.png" },
  ].forEach(({ c, name }) => downloadCanvas(c, name));
});
