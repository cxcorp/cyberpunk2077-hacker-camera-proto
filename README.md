# cyberpunk2077-hacker-camera-proto

Read Cyberpunk 2077 hacking minigame's details with your phone camera, online. Client-side JS only.

Work in progress, tensorflow and some additional OpenCV preprocessing needed.

Online solver for the minigame available at https://github.com/cxcorp/cyberpunk2077-hacking-solver.

## Demo

![](https://raw.githubusercontent.com/cxcorp/cyberpunk2077-hacker-camera-proto/master/docs/demo.gif)

## Try it

Clone repo, `npm i`, `npm start`, open ngrok tunnel `ngrok http 3000`, open ngrok's **HTTPS** link on your phone, and point it at the code matrix (or at a screenshot of one) to see a perspective corrected code grid - it automatically detects the grid size. If ngrok is no-go, try the `foxylion/nginx-self-signed-https` Docker image. HTTPS is needed to get the camera to work on mobile devices.


## Notes

Tesseract font training/finetuning, following [this tutorial](https://tesseract-ocr.github.io/tessdoc/TrainingTesseract-4.00#tesstutorial).

```
src/training/tesstrain.sh --fonts_dir ../rajdhani --lang eng --linedata_only \
  --noextract_font_properties --langdata_dir ../langdata \
  --training_text ../custom_traintext.txt \
  --tessdata_dir ./tessdata --output_dir ../engeval --fontlist 'Rajdhani Semi-Bold' 'Rajdhani Regular'

mkdir -p ../rajdhani_from_full
combine_tessdata -e tessdata/best/eng.traineddata \
  ../rajdhani_from_full/eng.lstm

lstmtraining --model_output ../rajdhani_from_full/rajdhani \
  --continue_from ../rajdhani_from_full/eng.lstm \
  --traineddata tessdata/best/eng.traineddata \
  --train_listfile ../engeval/eng.training_files.txt \
  --max_iterations 400

# test
lstmeval --model ../rajdhani_from_full/rajdhani_checkpoint \
  --traineddata tessdata/best/eng.traineddata \
  --eval_listfile ../engeval/eng.training_files.txt

# produce traineddata
lstmtraining --stop_training \
  --continue_from ../rajdhani_from_full/rajdhani_checkpoint \
  --traineddata tessdata/best/eng.traineddata \
  --model_output ../eng-rajdhani.traineddata

# compress "best" -> "fast" traineddata (float->int)
combine_tessdata -c ../eng-rajdhani.traineddata
```

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

### Available Scripts

In the project directory, you can run:

#### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

#### `yarn test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

#### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

#### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

### Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

#### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

#### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

#### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

#### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

#### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

#### `yarn build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
