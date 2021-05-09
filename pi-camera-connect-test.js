const fs = require('fs');
const PiCamera = require("pi-camera-connect");

const snap_path = `${__dirname}/test2.jpg`;
const cam = new PiCamera.StillCamera({
    width: 640,
    height: 480,
    delay: 200,
    awbMode: PiCamera.AwbMode.Auto,
});

const takeShot = async () => {
    const start_time = Date.now();
    cam.takeImage().then((image) => {
        console.log('captured. time: ' + (Date.now() - start_time));
        console.log(image.length + ' bytes captured.');
        caplen = image.length;
        fs.writeFileSync(snap_path, image);
    }).catch((error) => {
        console.error('写真撮るの失敗した\r\n' + error);
    });
};

const run = () => {
    takeShot();
};

run();