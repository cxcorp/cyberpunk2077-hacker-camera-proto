/* global cv */

import { useEffect, useState, useRef, useCallback } from "react";
import { createWorker, createScheduler, PSM } from "tesseract.js";
import "./App.css";

const SOURCE_SIZE = 1080;

const constraints = {
  video: {
    facingMode: {
      ideal: "environment",
    },
    /* aspectRatio: {
      ideal: 1,
    }, */
    resizeMode: "crop-and-scale",
    width: {
      ideal: SOURCE_SIZE,
    },
  },
};

const uniqChars = (arr) => [...new Set(arr.join("").split(""))];
const getOcrWhitelist = () =>
  [" ", ...uniqChars(["1C", "55", "7A", "BD", "E9", "FF"])].join("");

const ocrScheduler = createScheduler();

let workerLoggerHook = null;

/** @type {Promise<void>} */
let tesseractReady = null;

/** @returns {Promise<void>} */
const loadTesseractWorkers = () => {
  if (tesseractReady !== null) {
    return tesseractReady;
  }

  // const MAX_PROBABLE_COL_COUNT = 7;
  // const workerCount = window.navigator?.hardwareConcurrency
  //   ? Math.min(window.navigator.hardwareConcurrency, MAX_PROBABLE_COL_COUNT)
  //   : 2;

  const initPromises = [];
  for (let i = 0; i < 1; i++) {
    const worker = createWorker({
      langPath: `${process.env.PUBLIC_URL}/ocr`,
      gzip: false,
      logger: (msg) => {
        console.log(`[worker ${i}]: `, msg);

        if (workerLoggerHook) {
          workerLoggerHook(msg);
        }
      },
      errorHandler: (err) => console.error(`[worker ${i}]: `, err),
    });

    const initPromise = worker
      .load()
      .then(() => worker.loadLanguage("eng"))
      .then(() => worker.initialize("eng"))
      .then(() =>
        worker.setParameters({
          tessedit_char_whitelist: getOcrWhitelist(),
          tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        })
      )
      .then(() => {
        ocrScheduler.addWorker(worker);
      });
    initPromises.push(initPromise);
  }

  tesseractReady = Promise.all(initPromises);
  return tesseractReady;
};

function stringifyError(err) {
  if (typeof err === "undefined") {
    err = "";
  } else if (typeof err === "number") {
    if (!isNaN(err)) {
      if (typeof cv !== "undefined") {
        err = "Exception: " + cv.exceptionFromPtr(err).msg;
      }
    }
  } else if (typeof err === "string") {
    let ptr = Number(err.split(" ")[0]);
    if (!isNaN(ptr)) {
      if (typeof cv !== "undefined") {
        err = "Exception: " + cv.exceptionFromPtr(ptr).msg;
      }
    }
  } else if (err instanceof Error) {
    err = err.stack.replace(/\n/g, "<br>");
  }
  return err;
}

const mapRange = (value, x1, y1, x2, y2) =>
  ((value - x1) * (y2 - x2)) / (y1 - x1) + x2;
const mapPoint = ({ x, y }, inRange, outRange) =>
  new cv.Point(
    mapRange(x, inRange.xmin, inRange.xmax, outRange.xmin, outRange.xmax),
    mapRange(y, inRange.ymin, inRange.ymax, outRange.ymin, outRange.ymax)
  );

const pointDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const vectorFromPoints = (start, end) => ({
  x: end.x - start.x,
  y: end.y - start.y,
});
const vectorDot = (a, b) => a.x * b.x + a.y * b.y;

function App() {
  useEffect(() => {
    window.feather.replace();
  }, []);

  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState();

  /*useEffect(() => {
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        alert("enumerateDevices() not supported.");
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      setVideoDevices(videoDevices);
    })();
  }, []);*/

  const videoRef = useRef();
  const outputCanvasRef = useRef();
  const debugCanvasRef = useRef();
  const [outputCanvasType, setOutputCanvasType] = useState("normal");
  const renderDebugCanvasRef = useRef(false);
  renderDebugCanvasRef.current = outputCanvasType === "debug";
  const sourceCanvasRef = useRef();

  const displayCanvasRef = useRef();

  const fpsRef = useRef();

  const [cvRunning, setCvRunning] = useState(false);

  const handleStart = async () => {
    setCvRunning(false);

    if (!navigator?.mediaDevices?.getUserMedia) {
      alert(
        `Your browser does not support MediaDevices.getUserMedia(). Your browser may be too old. If you're on iOS, only Safari supports the camera API.`
      );
      return;
    }
    const updContstraints = {
      ...constraints,
      /*deviceId: {
                exact: selectedDevice.deviceId,
              },*/
    };

    function handleloadedmetadata() {
      setCvRunning(true);
    }
    videoRef.current.addEventListener("loadedmetadata", handleloadedmetadata);
    videoRef.current.setAttribute("autoplay", "");
    videoRef.current.setAttribute("muted", "");
    videoRef.current.setAttribute("playsinline", "");

    const stream = await window.navigator.mediaDevices.getUserMedia(
      updContstraints
    );
    videoRef.current.srcObject = stream;
    //videoRef.current.play();
  };

  const [captureImg, setCaptureImg] = useState();

  const outputColsRef = useRef([]);
  const captureCanvasRef = useRef();

  const handleCaptureClicked = useCallback(() => {
    setCvRunning(false);

    captureCanvasRef.current.width = outputCanvasRef.current.clientWidth;
    captureCanvasRef.current.height = outputCanvasRef.current.clientHeight;
    /** @type {CanvasRenderingContext2D} */
    const ctx = captureCanvasRef.current.getContext("2d");
    ctx.drawImage(outputCanvasRef.current, 0, 0);

    captureCanvasRef.current.classList.remove("d-none");
    const imgDataUrl = outputCanvasRef.current.toDataURL("image/png");
    setCaptureImg({ src: imgDataUrl });

    setTimeout(async () => {
      try {
        console.log("beginning to load tesseract workers");
        await loadTesseractWorkers();
        console.log("finish loading tesseract workers");

        const height = captureCanvasRef.current.height;
        const xSplits = outputColsRef.current;
        const tileWidth = Math.abs(xSplits[1] - xSplits[0]);
        const colSlices = xSplits.map((split) =>
          ctx.getImageData(split, 0, tileWidth, height)
        );

        let currXOffset = 0;

        workerLoggerHook = (msg) => {
          console.log(`[worker]: `, msg);

          if (!isNaN(msg.progress)) {
            ctx.beginPath();
            ctx.fillStyle = "#3498db";
            ctx.fillRect(currXOffset, 0, tileWidth * msg.progress, 10);
            ctx.closePath();
          }
        };

        /*const jobs = await Promise.all(
          xSplits.map((x) =>
            ocrScheduler.addJob("recognize", captureCanvasRef.current, {
              rectangle: {
                top: 0,
                left: x,
                height: height,
                width: tileWidth,
              },
            })
          )
        );*/

        const sliceCanvas = document.createElement("canvas");
        for (let i = 0; i < xSplits.length; i++) {
          currXOffset = xSplits[i];
          const colSlice = colSlices[i];
          sliceCanvas.width = tileWidth;
          sliceCanvas.height = height;
          sliceCanvas.getContext("2d").putImageData(colSlice, 0, 0);
          const imageData = sliceCanvas.toDataURL("image/png");

          const { data } = await ocrScheduler.addJob("recognize", imageData);
          const { text, lines } = data;

          ctx.textAlign = "center";
          for (const { confidence, text, bbox } of lines) {
            const { x0, y0, x1, y1 } = bbox;

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 0, 0, ${confidence * 255})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(xSplits[i] + x0, y0, x1 - x0, y1 - y0);

            const trimmedText = text.replace(/\s+/g, "");

            ctx.font = '20px "Rajdhani SemiBold"';
            ctx.strokeText(
              trimmedText,
              xSplits[i] + x0 + (x1 - x0) / 2,
              y1 + 25
            );
            ctx.closePath();
          }
          console.log(data);
        }
      } catch (e) {
        console.error(e);
        alert(e);
      }
    }, 100);
  }, [setCvRunning, outputCanvasRef, setCaptureImg, outputColsRef]);

  const handleStopClicked = useCallback(() => {
    setCvRunning(false);
  }, [setCvRunning]);

  useEffect(() => {
    if (!cvRunning) {
      return;
    }

    let animFrameId;

    const fpsSamples = [0, 0, 0, 0, 0, 0];
    const getFps = () => fpsSamples.reduce((a, b) => a + b) / fpsSamples.length;
    (async () => {
      /** @type {CanvasRenderingContext2D} */
      const displayCtx = displayCanvasRef.current.getContext("2d");
      /** @type {CanvasRenderingContext2D} */
      const sourceCtx = sourceCanvasRef.current.getContext("2d");

      const videoSmallestEdge = Math.min(
        videoRef.current.videoWidth,
        videoRef.current.videoHeight
      );
      const videoWidth =
        videoRef.current.videoWidth === videoSmallestEdge
          ? videoRef.current.videoWidth
          : videoRef.current.videoHeight;
      const videoHeight =
        videoRef.current.videoHeight === videoSmallestEdge
          ? videoRef.current.videoHeight
          : videoRef.current.videoWidth;
      const videoCropX = Math.floor(
        (videoRef.current.videoWidth - videoWidth) / 2
      );
      const videoCropY = Math.floor(
        (videoRef.current.videoHeight - videoHeight) / 2
      );

      sourceCanvasRef.current.width = SOURCE_SIZE;
      sourceCanvasRef.current.height = SOURCE_SIZE;
      const sourceWidth = SOURCE_SIZE;
      const sourceHeight = SOURCE_SIZE;

      const displayWidth = displayCanvasRef.current.clientWidth;
      const displayHeight = displayWidth;
      displayCanvasRef.current.width = displayWidth;
      displayCanvasRef.current.height = displayHeight;
      debugCanvasRef.current.width = displayWidth;
      debugCanvasRef.current.height = displayHeight;

      const renderGridSizeMultiplier = 1 / 2;
      const sourceGridWidth = sourceWidth * renderGridSizeMultiplier;
      const sourceGridHeight = sourceWidth * renderGridSizeMultiplier;
      const sourceGridStartX = sourceWidth / 2 - sourceGridWidth / 2;
      const sourceGridStartY = sourceHeight / 2 - sourceGridHeight / 2;

      outputCanvasRef.current.width = sourceGridWidth;
      outputCanvasRef.current.height = sourceGridHeight;

      const displayGridWidth = (displayWidth / sourceWidth) * sourceGridWidth;
      const displayGridHeight =
        (displayHeight / sourceHeight) * sourceGridHeight;
      const displayGridStartX = displayWidth / 2 - displayGridWidth / 2;
      const displayGridStartY = displayHeight / 2 - displayGridHeight / 2;

      if (window.cv instanceof Promise) {
        window.cv = await window.cv;
      }

      displayCtx.font = "16px Input";

      let startTs;
      async function doRender(timestamp) {
        if (startTs === undefined) startTs = timestamp;
        else if (timestamp - startTs < 33) {
          animFrameId = window.requestAnimationFrame(doRender);
          return;
        }

        const fps = 1000 / (timestamp - startTs);
        fpsSamples.shift();
        fpsSamples.push(fps);
        fpsRef.current.innerText = `${Math.round(getFps())}`;
        startTs = timestamp;

        try {
          displayCtx.drawImage(
            videoRef.current,
            videoCropX,
            videoCropY,
            videoSmallestEdge,
            videoSmallestEdge,
            0,
            0,
            displayWidth,
            displayHeight
          );

          displayCtx.strokeStyle = "#00ff00";
          displayCtx.lineWidth = 2;

          displayCtx.strokeRect(
            displayGridStartX,
            displayGridStartY,
            displayGridWidth,
            displayGridHeight
          );

          sourceCtx.drawImage(
            videoRef.current,
            videoCropX,
            videoCropY,
            videoSmallestEdge,
            videoSmallestEdge,
            0,
            0,
            sourceCanvasRef.current.width,
            sourceCanvasRef.current.height
          );
          const image = sourceCtx.getImageData(
            sourceGridStartX,
            sourceGridStartY,
            sourceGridWidth,
            sourceGridHeight
          );

          const sourceImg = cv.matFromImageData(image);
          const result = new cv.Mat();

          // This converts the image to a greyscale.
          cv.cvtColor(sourceImg, result, cv.COLOR_BGR2GRAY);
          sourceImg.delete();

          const blurred = new cv.Mat();
          cv.GaussianBlur(
            result,
            blurred,
            new cv.Size(5, 5),
            0,
            0,
            cv.BORDER_DEFAULT
          );
          result.delete();

          const threshold = new cv.Mat();
          cv.threshold(blurred, threshold, 185, 255, cv.THRESH_BINARY);
          blurred.delete();

          const dilated = new cv.Mat();
          const kernel = cv.Mat.ones(4, 4, cv.CV_8U);
          const anchor = new cv.Point(-1, -1);

          cv.dilate(
            threshold,
            dilated,
            kernel,
            anchor,
            5,
            cv.BORDER_CONSTANT,
            cv.morphologyDefaultBorderValue()
          );
          kernel.delete();

          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.findContours(
            dilated,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
          );

          //dilated.delete();

          let output = threshold.clone();
          threshold.delete();

          // Subtract a couple from the guess before sqrt because the UI text elements
          // below the grid dilate up to be around the size of the grid elements, so
          // at low actual grid sizes this throws the guess up to 5 instead of 4
          const contourLenModifier = -2;
          const closestGridSize = Number.isInteger(Math.sqrt(contours.size()))
            ? Math.sqrt(contours.size())
            : Math.round(
                // sub 0.25 to prefer rounding down instead of up since it's more likely
                // that there's MORE non-grid elements on screen instead of fewer
                Math.sqrt(contours.size() + contourLenModifier) - 0.25
              );
          const tileSizeOfClosestGrid = sourceGridWidth / (closestGridSize - 1);
          const areaOfTileOfClosestGrid =
            tileSizeOfClosestGrid * tileSizeOfClosestGrid;

          const midpoint = (rect) => ({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          });

          const dilatedC = new cv.Mat();
          cv.cvtColor(dilated, dilatedC, cv.COLOR_GRAY2RGB);
          dilated.delete();

          let nearTileSizeContours = [];
          const contoursSize = contours.size();
          for (let i = 0; i < contoursSize; i++) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);

            // skip contours that aren't near approx size
            const rect = cv.boundingRect(cnt);
            const aspectRatio = rect.width / rect.height;
            if (
              area <= areaOfTileOfClosestGrid &&
              aspectRatio < 2.5 &&
              aspectRatio > 0.8
            ) {
              nearTileSizeContours.push({
                cnt,
                boundingRect: rect,
                midpoint: midpoint(rect),
              });
              /* cv.rectangle(
                output,
                { x: rect.x, y: rect.y },
                { x: rect.x + rect.width, y: rect.y + rect.height },
                new cv.Scalar(255, 255, 255),
                2
              ); */
            } else {
              // not used for anything anymore, clean up - selected cnts are cleaned up later
              cnt.delete();
            }
          }

          if (renderDebugCanvasRef.current) {
            cv.imshow(debugCanvasRef.current, dilatedC);
          }
          dilatedC.delete();

          const medianBy = (arr, selector) => {
            if (arr.length === 0) {
              return 0;
            }
            if (arr.length === 1) {
              return selector(arr[0]);
            }

            const mapped = arr.map((a) => selector(a));
            mapped.sort((a, b) => a - b);
            const midIdx = Math.floor(mapped.length / 2);
            return mapped.length % 2 !== 0
              ? mapped[midIdx]
              : (mapped[midIdx - 1] + mapped[midIdx]) / 2;
          };

          // Get the median bounding box height
          const boundingBoxMedianHeight = medianBy(
            nearTileSizeContours,
            ({ boundingRect }) => boundingRect.height
          );
          const boundingBoxMedianWidth = medianBy(
            nearTileSizeContours,
            ({ boundingRect }) => boundingRect.width
          );

          const rectsClosestToMedian = [...nearTileSizeContours]
            .sort(
              ({ boundingRect: a }, { boundingRect: b }) =>
                Math.hypot(
                  a.height - boundingBoxMedianHeight,
                  a.width - boundingBoxMedianWidth
                ) -
                Math.hypot(
                  b.height - boundingBoxMedianHeight,
                  a.width - boundingBoxMedianWidth
                )
            )
            .slice(0, closestGridSize * closestGridSize);
          const boundingRectangles = rectsClosestToMedian.map(
            ({ boundingRect }) => boundingRect
          );

          nearTileSizeContours.forEach(({ cnt }) => cnt.delete());
          contours.delete();
          hierarchy.delete();

          boundingRectangles.sort((a, b) => {
            const mA = midpoint(a);
            const mB = midpoint(b);
            return mA.y > mB.y
              ? mA.x + mA.y * 1000 - (mB.x + mB.y * 1000)
              : mA.x + mA.y * 1000 - (mB.x + mB.y * 1000);
          });

          function closestTo(points, point) {
            return points.reduce((max, val) => {
              return Math.hypot(point.x - val.x, point.y - val.y) <
                Math.hypot(point.x - max.x, point.y - max.y)
                ? val
                : max;
            });
          }

          if (
            boundingRectangles.length === closestGridSize * closestGridSize &&
            closestGridSize >= 3
          ) {
            const midpoints = boundingRectangles.map((rect) => midpoint(rect));
            const topLeft = closestTo(midpoints, { x: 0, y: 0 });
            const topRight = closestTo(midpoints, {
              x: sourceGridWidth,
              y: 0,
            });
            const bottomLeft = closestTo(midpoints, {
              x: 0,
              y: sourceGridHeight,
            });
            const bottomRight = closestTo(midpoints, {
              x: sourceGridWidth,
              y: sourceGridHeight,
            });

            function isRectTooWeird() {
              const getThreePointEdgeAngle = (a, b, c) =>
                Math.acos(
                  vectorDot(vectorFromPoints(a, b), vectorFromPoints(b, c)) /
                    (pointDistance(a, b) * pointDistance(b, c))
                ) *
                (180 / Math.PI);

              const topLeftAngle = getThreePointEdgeAngle(
                bottomLeft,
                topLeft,
                topRight
              );
              const topRightAngle = getThreePointEdgeAngle(
                topLeft,
                topRight,
                bottomRight
              );
              const bottomRightAngle = getThreePointEdgeAngle(
                topRight,
                bottomRight,
                bottomLeft
              );
              const bottomLeftAngle = getThreePointEdgeAngle(
                bottomRight,
                bottomLeft,
                topLeft
              );

              // not an isosceles trapezoid?
              const diffTlBl = Math.abs(topLeftAngle - bottomLeft);
              const diffTlTr = Math.abs(topLeftAngle - topRightAngle);
              const diffTrBr = Math.abs(topRightAngle - bottomRightAngle);
              const diffBlBr = Math.abs(bottomLeftAngle - bottomRightAngle);
              if (
                diffTlBl > 5 &&
                diffTrBr > 5 &&
                diffTlTr > 5 &&
                diffBlBr > 5
              ) {
                console.log("[rectTooWeird] not an isosceles trapezoid");
                return true;
              }

              if (
                Math.abs(topLeftAngle - topRightAngle) > 25 &&
                Math.abs(bottomLeftAngle - bottomRightAngle) > 25
              ) {
                // parallellogram?
                console.log("[rectTooWeird] parallellogram");
                return true;
              }

              const topBotLinesRatio =
                pointDistance(topLeft, topRight) /
                pointDistance(bottomLeft, bottomRight);
              const leftRightLinesRatio =
                pointDistance(topLeft, bottomLeft) /
                pointDistance(topRight, bottomRight);

              // opposite lines' ratios not too wonky -> not a near-triangle trapezoid or something
              const max = 3;
              const min = 1 / 3;
              if (
                topBotLinesRatio > max ||
                topBotLinesRatio < min ||
                leftRightLinesRatio > max ||
                leftRightLinesRatio < min
              ) {
                console.log("[rectTooWeird] opposite line ratios");
                return true;
              }

              const vertLineLen =
                (pointDistance(topLeft, bottomLeft) +
                  pointDistance(topRight, bottomRight)) /
                2;
              const horizLineLen =
                (pointDistance(topLeft, topRight) +
                  pointDistance(bottomLeft, bottomRight)) /
                2;
              // aspect ratio is over 3? nah dawg
              if (horizLineLen / vertLineLen > 3) {
                console.log("[rectTooWeird] aspect ratio > 3");
                return true;
              }

              return false;
            }

            if (isRectTooWeird()) {
              console.log("bail-isRectTooWeird");
              /* cv.putText(
                output,
                `grid: ${closestGridSize}`,
                new cv.Point(10, 30),
                cv.FONT_HERSHEY_PLAIN,
                2,
                new cv.Scalar(255, 255, 255),
                2
              ); */

              const resized = new cv.Mat();
              cv.resize(output, resized, new cv.Size(400, 400), cv.INTER_AREA);
              output.delete();
              output = resized;

              cv.cvtColor(output, output, cv.COLOR_GRAY2RGB);
              cv.imshow(outputCanvasRef.current, output);
              output.delete();

              animFrameId = window.requestAnimationFrame(doRender);
              return;
            }

            // four point transform
            function fourPointTransform({ tl, tr, br, bl }) {
              // calculate new width of the image which is the largest
              // distance between the top and bot lines
              const widthBot = Math.hypot(br.x - bl.x, br.y - bl.y);
              const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
              const maxWidth = Math.max(
                Math.round(widthTop),
                Math.round(widthBot)
              );

              // calculate new height
              const heightLeft = Math.hypot(tr.x - br.x, tr.y - br.y);
              const heightRight = Math.hypot(tl.x - bl.x, tl.y - bl.y);
              const maxHeight = Math.max(
                Math.round(heightLeft),
                Math.round(heightRight)
              );
              const newSideLength = Math.min(maxWidth, maxHeight);

              const srcRect = cv.matFromArray(4, 1, cv.CV_32FC2, [
                tl.x,
                tl.y,
                tr.x,
                tr.y,
                br.x,
                br.y,
                bl.x,
                bl.y,
              ]);
              const dstRect = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0,
                0,
                newSideLength - 1,
                0,
                newSideLength - 1,
                newSideLength - 1,
                0,
                newSideLength - 1,
              ]);

              const M = cv.getPerspectiveTransform(srcRect, dstRect);

              srcRect.delete();
              dstRect.delete();

              return { M, newWidth: newSideLength, newHeight: newSideLength };
            }

            const { M, newWidth, newHeight } = fourPointTransform({
              tl: topLeft,
              tr: topRight,
              br: bottomRight,
              bl: bottomLeft,
            });

            const acualGridTileWidth = newWidth / (closestGridSize - 1);

            // pad it to the actua-l outer grid so camera doesn't get too close
            const padX = acualGridTileWidth / 2;
            const padY = acualGridTileWidth / 2;
            const M_inv = M.inv(cv.DECOMP_SVD); // most similar to np.linalg.pinv(M)
            M.delete();
            const paddedDstRect = cv.matFromArray(4, 1, cv.CV_32FC2, [
              -padX,
              -padY,
              newWidth - 1 + padX,
              0 - padY,
              newWidth - 1 + padX,
              newHeight - 1 + padY,
              0 - padX,
              newHeight + 1 + padY,
            ]);

            const paddedOriginalRect = cv.Mat.zeros(4, 1, cv.CV_32FC2);
            cv.perspectiveTransform(paddedDstRect, paddedOriginalRect, M_inv);
            paddedDstRect.delete();
            M_inv.delete();

            function mat4_1_CV32FtoPoints(mat) {
              let points = [];
              for (let i = 0; i < 8; i += 2) {
                points.push({ x: mat.data32F[i], y: mat.data32F[i + 1] });
              }
              return points;
            }

            const paddedPoints = mat4_1_CV32FtoPoints(paddedOriginalRect);
            paddedOriginalRect.delete();

            const {
              M: M_padded,
              newHeight: newHeightPadded,
              newWidth: newWidthPadded,
            } = fourPointTransform({
              tl: paddedPoints[0],
              tr: paddedPoints[1],
              br: paddedPoints[2],
              bl: paddedPoints[3],
            });

            const newSizeAspectRatio = newWidthPadded / newHeightPadded;

            if (
              newHeightPadded > sourceGridHeight + padY ||
              newWidthPadded > sourceGridWidth + padX ||
              newSizeAspectRatio > 1.2 ||
              newSizeAspectRatio < 0.8 ||
              paddedPoints.some(
                (point) =>
                  point.x < 0 - padX ||
                  point.y < 0 - padY ||
                  point.x > sourceGridWidth + padX ||
                  point.y > sourceGridHeight + padY
              )
            ) {
              // lol wtf, naw man
              M_padded.delete();

              console.log("bail-fuckload-of-ehtoja");

              /* cv.putText(
                output,
                `grid: ${closestGridSize}`,
                new cv.Point(10, 30),
                cv.FONT_HERSHEY_PLAIN,
                2,
                new cv.Scalar(255, 255, 255),
                2
              ); */

              const resized = new cv.Mat();
              cv.resize(output, resized, new cv.Size(400, 400), cv.INTER_AREA);
              output.delete();
              output = resized;

              cv.cvtColor(output, output, cv.COLOR_GRAY2RGB);
              cv.imshow(outputCanvasRef.current, output);
              output.delete();

              animFrameId = window.requestAnimationFrame(doRender);
              return;
            }

            const perspectived = new cv.Mat();
            cv.warpPerspective(
              output,
              perspectived,
              M_padded,
              new cv.Size(newHeightPadded, newWidthPadded),
              cv.INTER_LINEAR,
              cv.BORDER_CONSTANT,
              new cv.Scalar()
            );

            M_padded.delete();

            output.delete();
            output = perspectived;

            outputColsRef.current = [];
            for (let i = 0; i < closestGridSize; i++) {
              const x = mapRange(
                i * acualGridTileWidth,
                0,
                output.cols,
                0,
                400
              );
              outputColsRef.current.push(x);
            }
            const tileColor = new cv.Scalar(255, 255, 255);
            /* for (let y = 0; y < closestGridSize; y++) {
              for (let x = 0; x < closestGridSize; x++) {
                const xx = x * acualGridTileWidth;
                const yy = y * acualGridTileWidth;
                cv.rectangle(
                  output,
                  {
                    x: xx + tilePad,
                    y: yy + tilePad,
                  },
                  {
                    x: xx + acualGridTileWidth - tilePad,
                    y: yy + acualGridTileWidth - tilePad,
                  },
                  tileColor
                );
              }
            } */

            displayCtx.beginPath();
            displayCtx.strokeStyle = "#ff0000";
            displayCtx.lineWidth = 2;
            [
              [paddedPoints[0], paddedPoints[1]],
              [paddedPoints[1], paddedPoints[2]],
              [paddedPoints[2], paddedPoints[3]],
              [paddedPoints[3], paddedPoints[0]],
            ]
              .map((pair) =>
                pair.map((point) => {
                  // interpolate point from sourceGrid onto displayGrid,
                  // add displayGrid's displayCanvas offset and render
                  // to displayGrid
                  return mapPoint(
                    point,
                    {
                      xmin: 0,
                      xmax: sourceGridWidth,
                      ymin: 0,
                      ymax: sourceGridHeight,
                    },
                    {
                      xmin: 0 + displayGridStartX,
                      xmax: displayGridWidth + displayGridStartX,
                      ymin: 0 + displayGridStartY,
                      ymax: displayGridHeight + displayGridStartY,
                    }
                  );
                })
              )
              .forEach(([start, end]) => {
                displayCtx.moveTo(start.x, start.y);
                displayCtx.lineTo(end.x, end.y);
              });
            displayCtx.stroke();
            displayCtx.closePath();
          }

          const resized = new cv.Mat();
          cv.resize(output, resized, new cv.Size(400, 400), cv.INTER_AREA);
          output.delete();
          output = resized;

          /* cv.putText(
            output,
            `grid: ${closestGridSize}`,
            new cv.Point(10, 30),
            cv.FONT_HERSHEY_PLAIN,
            2,
            new cv.Scalar(255, 255, 255),
            2
          ); */

          cv.bitwise_not(output, output);
          cv.cvtColor(output, output, cv.COLOR_GRAY2RGB);
          cv.imshow(outputCanvasRef.current, output);
          output.delete();

          // Render the processed image to the canvas
          animFrameId = window.requestAnimationFrame(doRender);
        } catch (e) {
          const err = stringifyError(e);
          console.error(err);
          console.error(e);
          alert(err);
        }
      }

      animFrameId = window.requestAnimationFrame(doRender);
    })();
    return () => {
      window.cancelAnimationFrame(animFrameId);
    };
  }, [cvRunning]);

  return (
    <>
      <div className="display-cover">
        <video className="d-none" autoPlay ref={videoRef}></video>
        <p>display</p>
        <div style={{ display: "flex" }}>
          {["normal", "debug"].map((type) => (
            <button
              key={type}
              onClick={() => {
                setOutputCanvasType(type);
              }}
            >
              {type}
            </button>
          ))}
        </div>
        <canvas
          style={{
            width: "100%",
            display: outputCanvasType === "normal" ? "block" : "none",
          }}
          ref={displayCanvasRef}
        ></canvas>
        <canvas
          style={{
            width: "100%",
            display: outputCanvasType === "debug" ? "block" : "none",
          }}
          ref={debugCanvasRef}
        ></canvas>
        <p>source</p>
        <canvas className="d-none" ref={sourceCanvasRef}></canvas>

        <button onClick={handleStopClicked} style={{ padding: "0.5rem 2rem" }}>
          Stop
        </button>
        <button
          onClick={handleCaptureClicked}
          style={{ padding: "0.5rem 2rem" }}
        >
          Capture
        </button>
        <canvas
          className="d-none"
          style={{ boxSizing: "content-box" }}
          ref={captureCanvasRef}
        ></canvas>

        {captureImg && (
          <>
            <p>output img as {"<img>"} so you can save it</p>
            <img src={captureImg.src} style={{ border: "1px solid #00ff00" }} />
          </>
        )}

        <img className="screenshot-image d-none" alt="" />
        <div className="controls">
          <button
            onClick={handleStart}
            className="btn btn-danger play"
            title="Play"
          >
            <i data-feather="play-circle"></i>
          </button>
          <button className="btn btn-info pause d-none" title="Pause">
            <i data-feather="pause"></i>
          </button>
          <button
            className="btn btn-outline-success screenshot d-none"
            title="ScreenShot"
          >
            <i data-feather="image"></i>
          </button>
        </div>
      </div>
      <p>
        output, fps: <span ref={fpsRef}></span>
      </p>
      <canvas className="" ref={outputCanvasRef}></canvas>
    </>
  );
}

export default App;
