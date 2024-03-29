async function loadOpenCV(
  paths,
  onloadCallback,
  log = (...data) => log(...data)
) {
  let OPENCV_URL = "";
  let asmPath = "";
  let wasmPath = "";
  let simdPath = "";
  let threadsPath = "";
  let threadsSimdPath = "";

  if (!(paths instanceof Object)) {
    throw new Error(
      "The first input should be a object that points the path to the OpenCV.js"
    );
  }

  if ("asm" in paths) {
    asmPath = paths["asm"];
  }

  if ("wasm" in paths) {
    wasmPath = paths["wasm"];
  }

  if ("threads" in paths) {
    threadsPath = paths["threads"];
  }

  if ("simd" in paths) {
    simdPath = paths["simd"];
  }

  if ("threadsSimd" in paths) {
    threadsSimdPath = paths["threadsSimd"];
  }

  let wasmSupported = !(typeof WebAssembly === "undefined");
  if (!wasmSupported && OPENCV_URL === "" && asmPath != "") {
    OPENCV_URL = asmPath;
    log("The OpenCV.js for Asm.js is loaded now");
  } else if (!wasmSupported && asmPath == "") {
    throw new Error(
      "The browser supports the Asm.js only, but the path of OpenCV.js for Asm.js is empty"
    );
  }

  let simdSupported = wasmSupported ? await wasmFeatureDetect.simd() : false;
  let threadsSupported = wasmSupported
    ? await wasmFeatureDetect.threads()
    : false;

  if (simdSupported && threadsSupported && threadsSimdPath != "") {
    OPENCV_URL = threadsSimdPath;
    log("The OpenCV.js with simd and threads optimization is loaded now");
  } else if (simdSupported && simdPath != "") {
    if (threadsSupported && threadsSimdPath === "") {
      log(
        "The browser supports simd and threads, but the path of OpenCV.js with simd and threads optimization is empty"
      );
    }
    OPENCV_URL = simdPath;
    log("The OpenCV.js with simd optimization is loaded now.");
  } else if (threadsSupported && threadsPath != "") {
    if (simdSupported && threadsSimdPath === "") {
      log(
        "The browser supports simd and threads, but the path of OpenCV.js with simd and threads optimization is empty"
      );
    }
    OPENCV_URL = threadsPath;
    log("The OpenCV.js with threads optimization is loaded now");
  } else if (wasmSupported && wasmPath != "") {
    if (simdSupported && threadsSupported) {
      log(
        "The browser supports simd and threads, but the path of OpenCV.js with simd and threads optimization is empty"
      );
    }

    if (simdSupported) {
      log(
        "The browser supports simd optimization, but the path of OpenCV.js with simd optimization is empty"
      );
    }

    if (threadsSupported) {
      log(
        "The browser supports threads optimization, but the path of OpenCV.js with threads optimization is empty"
      );
    }

    OPENCV_URL = wasmPath;
    log("The OpenCV.js for wasm is loaded now");
  } else if (wasmSupported) {
    log(
      "The browser supports wasm, but the path of OpenCV.js for wasm is empty"
    );
  }

  if (OPENCV_URL === "") {
    throw new Error("No available OpenCV.js, please check your paths");
  }

  let script = document.createElement("script");
  script.setAttribute("async", "");
  script.setAttribute("type", "text/javascript");
  script.addEventListener("load", () => {
    onloadCallback();
  });
  script.addEventListener("error", () => {
    log("Failed to load opencv.js");
  });
  script.src = OPENCV_URL;
  let node = document.getElementsByTagName("script")[0];
  if (node.src != OPENCV_URL) {
    node.parentNode.insertBefore(script, node);
  }
}
